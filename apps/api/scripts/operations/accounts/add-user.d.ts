/**
 * Type surface for the plain-JavaScript `add-user.js` operations script.
 *
 * The script takes its PostgreSQL pool, password hasher, and logger as injected
 * dependencies, so this declaration names that seam instead of `pg`'s full
 * `Pool` and Node's full `Console`. The test suite injects minimal doubles into
 * exactly these three slots; a caller that passes the real defaults still fits.
 */

export interface AddUserPool {
    query(
        sql: string,
        parameters: unknown[]
    ): Promise<{ rowCount: number | null; rows: Array<{ id: number }> }>;
    end(): Promise<void>;
}

export interface AddUserDependencies {
    environment?: NodeJS.ProcessEnv;
    PoolClass?: new (configuration: {
        connectionString: string;
        application_name: string;
    }) => AddUserPool;
    hashPassword?: (password: string, rounds: number) => Promise<string>;
    logger?: {
        error(message: string): void;
        log(message: string): void;
    };
}

export interface AddUserResult {
    created: boolean;
    id: number | null;
}

export function databaseUrl(environment?: NodeJS.ProcessEnv): string;
export function addUser(
    dependencies?: AddUserDependencies
): Promise<AddUserResult>;
