import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { ValidatedRequestInput } from '@/middleware/request-validation';

/** Context after a query validator has parsed the request. */
export type NamecardTagQueryRequestContext<Query> = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'query', Query>
>;

/** Context after a JSON body validator has parsed the request. */
export type NamecardTagJsonRequestContext<Body> = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'json', Body>
>;

/** Context after a param validator has parsed the request. */
export type NamecardTagParamsRequestContext<Params> = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', Params>
>;

/** Context after both param and JSON body validators have parsed the request. */
export type NamecardTagParamsJsonRequestContext<Params, Body> = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', Params> &
        ValidatedRequestInput<'json', Body>
>;
