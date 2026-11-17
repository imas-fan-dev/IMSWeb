import type { Context, Env, MiddlewareHandler, ValidationTargets } from "hono";
import type { ErrorResponse } from '@imsweb/contracts/common';
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { messageFromError, statusFromError } from "@/utils/http/error-response";

type ValidationTarget = keyof ValidationTargets;

export type ValidatedRequestInput<Target extends ValidationTarget, Output> = {
    in: { [Key in Target]: ValidationTargets[Target] };
    out: { [Key in Target]: Output };
};

export type ValidatedRequestContext<
    E extends Env,
    Target extends ValidationTarget,
    Output,
> = Context<E, string, ValidatedRequestInput<Target, Output>>;

export interface RequestValidatorOptions {
    invalidMessage?: string;
    malformedMessage?: string;
    errorBody?: (message: string) => Record<string, string | boolean>;
    acceptMislabeledJson?: boolean;
    schemaErrorParser?: (value: unknown) => unknown;
}

type RequestParser<Output> = (value: unknown) => Output | Promise<Output>;

export interface RequestSchema<Output = unknown> {
    readonly _output: Output;
    safeParse(value: unknown):
        | { success: true; data: Output }
        | { success: false; error: unknown };
}

export type SchemaAdapter<SchemaOutput, Output> = (
    value: SchemaOutput,
) => Output | Promise<Output>;

function schemaParser<Schema extends RequestSchema, Output>(
    schema: Schema,
    adapt: SchemaAdapter<Schema['_output'], Output>,
    schemaErrorParser?: (value: unknown) => unknown,
): RequestParser<Output> {
    return async (value) => {
        const result = schema.safeParse(value);
        if (!result.success) {
            // Legacy parsers preserve endpoint-specific error text, but may not
            // expand the inputs accepted by the shared contract schema.
            schemaErrorParser?.(value);
            throw Object.assign(new Error(''), { status: 400, cause: result.error });
        }
        return adapt(result.data);
    };
}

function schemaValidator<Target extends ValidationTarget, Schema extends RequestSchema, Output>(
    target: Target,
    schema: Schema,
    options: RequestValidatorOptions,
    adapt?: SchemaAdapter<Schema['_output'], Output>,
): MiddlewareHandler<Env, string, ValidatedRequestInput<Target, Output>> {
    // SAFETY: callers without an adapter have Output equal to the schema output by overload.
    const identity = (value: Schema['_output']) => value as unknown as Output;
    return requestValidator(
        target,
        schemaParser(schema, adapt ?? identity, options.schemaErrorParser),
        options,
    );
}

function validationError(
    context: Context,
    message: string,
    options: RequestValidatorOptions,
): Response {
    const customBody = options.errorBody?.(message);
    if (customBody) return context.json(customBody, 400);
    return context.json({ error: message } satisfies ErrorResponse, 400);
}

export function requestValidator<Target extends ValidationTarget, Output>(
    target: Target,
    parse: RequestParser<Output>,
    options: RequestValidatorOptions = {},
): MiddlewareHandler<Env, string, ValidatedRequestInput<Target, Output>> {
    // SAFETY: Hono's validator type erases the generic target/output relation preserved by parse.
    const validate = validator(target, async (value, context) => {
        try {
            return await parse(value);
        } catch (error) {
            if (statusFromError(error) !== 400) throw error;
            return validationError(
                context,
                messageFromError(error) ||
                    options.invalidMessage ||
                    "请求参数无效",
                options,
            );
        }
    }) as unknown as MiddlewareHandler<
        Env,
        string,
        ValidatedRequestInput<Target, Output>
    >;

    return (async (context, next) => {
        const contentType = context.req.header("Content-Type") || "";
        if (
            target === "json" &&
            options.acceptMislabeledJson === true &&
            !/^application\/(?:[a-z0-9.-]+\+)?json(?:\s*;|$)/i.test(contentType)
        ) {
            let value: unknown;
            try {
                value = await context.req.json();
            } catch {
                return validationError(
                    context,
                    options.malformedMessage || "请求正文必须为合法的 JSON",
                    options,
                );
            }
            try {
                context.req.addValidatedData(
                    target,
                    (await parse(value)) as {},
                );
            } catch (error) {
                if (statusFromError(error) !== 400) throw error;
                return validationError(
                    context,
                    messageFromError(error) ||
                        options.invalidMessage ||
                        "请求参数无效",
                    options,
                );
            }
            return next();
        }
        try {
            return await validate(context, next);
        } catch (error) {
            if (
                target === "json" &&
                error instanceof HTTPException &&
                error.status === 400 &&
                error.message === "Malformed JSON in request body"
            ) {
                return validationError(
                    context,
                    options.malformedMessage || "请求正文必须为合法的 JSON",
                    options,
                );
            }
            throw error;
        }
    }) as MiddlewareHandler<Env, string, ValidatedRequestInput<Target, Output>>;
}

export function jsonValidator<Output>(
    parse: RequestParser<Output>,
    options: RequestValidatorOptions = {},
): MiddlewareHandler<Env, string, ValidatedRequestInput<"json", Output>> {
    return requestValidator("json", parse, options);
}

export function paramValidator<Output>(
    parse: RequestParser<Output>,
    options: RequestValidatorOptions = {},
): MiddlewareHandler<Env, string, ValidatedRequestInput<"param", Output>> {
    return requestValidator("param", parse, options);
}

export function queryValidator<Output>(
    parse: RequestParser<Output>,
    options: RequestValidatorOptions = {},
): MiddlewareHandler<Env, string, ValidatedRequestInput<"query", Output>> {
    return requestValidator("query", parse, options);
}

export function jsonSchemaValidator<Schema extends RequestSchema>(
    schema: Schema,
    options?: RequestValidatorOptions,
): MiddlewareHandler<Env, string, ValidatedRequestInput<"json", Schema['_output']>>;
export function jsonSchemaValidator<Schema extends RequestSchema, Output>(
    schema: Schema,
    options: RequestValidatorOptions,
    adapt: SchemaAdapter<Schema['_output'], Output>,
): MiddlewareHandler<Env, string, ValidatedRequestInput<"json", Output>>;
export function jsonSchemaValidator(
    schema: RequestSchema,
    options: RequestValidatorOptions = {},
    adapt?: SchemaAdapter<unknown, unknown>,
): MiddlewareHandler<Env, string, ValidatedRequestInput<"json", unknown>> {
    return schemaValidator("json", schema, options, adapt);
}

export function paramSchemaValidator<Schema extends RequestSchema>(
    schema: Schema,
    options?: RequestValidatorOptions,
): MiddlewareHandler<Env, string, ValidatedRequestInput<"param", Schema['_output']>>;
export function paramSchemaValidator<Schema extends RequestSchema, Output>(
    schema: Schema,
    options: RequestValidatorOptions,
    adapt: SchemaAdapter<Schema['_output'], Output>,
): MiddlewareHandler<Env, string, ValidatedRequestInput<"param", Output>>;
export function paramSchemaValidator(
    schema: RequestSchema,
    options: RequestValidatorOptions = {},
    adapt?: SchemaAdapter<unknown, unknown>,
): MiddlewareHandler<Env, string, ValidatedRequestInput<"param", unknown>> {
    return schemaValidator("param", schema, options, adapt);
}

export function querySchemaValidator<Schema extends RequestSchema>(
    schema: Schema,
    options?: RequestValidatorOptions,
): MiddlewareHandler<Env, string, ValidatedRequestInput<"query", Schema['_output']>>;
export function querySchemaValidator<Schema extends RequestSchema, Output>(
    schema: Schema,
    options: RequestValidatorOptions,
    adapt: SchemaAdapter<Schema['_output'], Output>,
): MiddlewareHandler<Env, string, ValidatedRequestInput<"query", Output>>;
export function querySchemaValidator(
    schema: RequestSchema,
    options: RequestValidatorOptions = {},
    adapt?: SchemaAdapter<unknown, unknown>,
): MiddlewareHandler<Env, string, ValidatedRequestInput<"query", unknown>> {
    return schemaValidator("query", schema, options, adapt);
}
