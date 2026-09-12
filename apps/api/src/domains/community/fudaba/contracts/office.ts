export function validFudabaOfficeId(value: string): boolean {
    return value.length >= 1 && value.length <= 128 &&
        !/[\u0000-\u001f\u007f/\\]/.test(value);
}
