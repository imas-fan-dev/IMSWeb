import type { Context, Env, MiddlewareHandler, ValidationTargets } from "hono";
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
}

type RequestParser<Output> = (value: unknown) => Output | Promise<Output>;

function validationError(
    context: Context,
    message: string,
    options: RequestValidatorOptions,
): Response {
    const body = options.errorBody?.(message) ?? { error: message };
    return context.json(body, 400);
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
