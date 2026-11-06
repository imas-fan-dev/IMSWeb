import type { FudabaOfficePublicLocationRecord } from '@/ports/repositories';

type PublicLocationCoordinates = Pick<FudabaOfficePublicLocationRecord,
    'precision' | 'latitude_e1' | 'longitude_e1' | 'latitude_exact' | 'longitude_exact'>;

export function publicOfficeLocation(location: PublicLocationCoordinates):
    { latitude: number; longitude: number; precision: 'exact' } {
    if (location.precision === 'exact') {
        if (location.latitude_exact === null || location.longitude_exact === null) {
            throw new Error('Exact public location is incomplete');
        }
        return {
            latitude: location.latitude_exact,
            longitude: location.longitude_exact,
            precision: 'exact'
        };
    }
    throw new Error('Regional locations are historical and cannot be published');
}
