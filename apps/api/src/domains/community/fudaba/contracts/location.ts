export interface FudabaRegionalLocation {
    latitude: number;
    longitude: number;
    precision: 'regional';
}

export function regionalLocation(
    latitudeE1: number,
    longitudeE1: number
): FudabaRegionalLocation {
    return {
        latitude: latitudeE1 / 10,
        longitude: longitudeE1 / 10,
        precision: 'regional'
    };
}
