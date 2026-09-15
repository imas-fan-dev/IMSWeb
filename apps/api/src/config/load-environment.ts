import fs from 'node:fs';
import path from 'node:path';

const API_PACKAGE_NAME = '@imsweb/api';

function findApiWorkspaceRoot(startDirectory: string): string | undefined {
    let directory = path.resolve(startDirectory);

    while (true) {
        const packagePath = path.join(directory, 'package.json');
        if (fs.existsSync(packagePath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
                    name?: string;
                };
                if (packageJson.name === API_PACKAGE_NAME) return directory;
            } catch {
                // Continue searching parent directories when a package file is incomplete.
            }
        }

        const parent = path.dirname(directory);
        if (parent === directory) return undefined;
        directory = parent;
    }
}

export function loadApiEnvironment(startDirectory = __dirname): string | undefined {
    const configuredPath = process.env.IMS_ENV_FILE;
    if (configuredPath !== undefined) {
        if (!configuredPath.trim()) return undefined;
        const environmentPath = path.resolve(configuredPath);
        process.loadEnvFile(environmentPath);
        return environmentPath;
    }

    const workspaceRoot = findApiWorkspaceRoot(startDirectory);
    if (!workspaceRoot) return undefined;

    const environmentPath = path.join(workspaceRoot, '.env');
    if (!fs.existsSync(environmentPath)) return undefined;

    process.loadEnvFile(environmentPath);
    return environmentPath;
}

loadApiEnvironment();
