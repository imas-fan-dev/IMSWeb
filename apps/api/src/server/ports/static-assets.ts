export interface StaticAssets {
    fetch(request: Request): Promise<Response>;
}
