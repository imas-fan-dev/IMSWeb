import type { UploadedFile } from '@/ports/http';
import type { ImageProcessor } from '@/ports/media';
import { normalizeUploadedImageToWebp } from '@/utils/media/normalize-uploaded-image';

export async function normalizeNamecardImage(
    file: UploadedFile,
    processor: ImageProcessor
): Promise<Uint8Array> {
    return normalizeUploadedImageToWebp(file, processor, 85);
}
