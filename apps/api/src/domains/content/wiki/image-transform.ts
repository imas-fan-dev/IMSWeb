import type { WikiImageTransform } from '@/ports/repositories';

type UploadFields = Record<string, string | undefined>;

const ROTATIONS = new Set([0, 90, 180, 270]);

function numericField(
    fields: UploadFields,
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
    label: string
): number {
    const raw = fields[key];
    const value = raw === undefined || raw === '' ? fallback : Number(raw);
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
        throw Object.assign(new Error(`${label}无效`), { status: 400 });
    }
    return value;
}

export function parseWikiImageTransform(
    fields: UploadFields,
    fallback: WikiImageTransform
): WikiImageTransform {
    const fit = fields.image_fit ?? fallback.fit;
    if (fit !== 'cover' && fit !== 'contain') {
        throw Object.assign(new Error('图片适配方式无效'), { status: 400 });
    }
    const rotation = numericField(
        fields,
        'image_rotation',
        fallback.rotation,
        0,
        270,
        '图片旋转角度'
    );
    if (!Number.isInteger(rotation) || !ROTATIONS.has(rotation)) {
        throw Object.assign(new Error('图片旋转角度无效'), { status: 400 });
    }
    return {
        fit,
        focalX: numericField(
            fields,
            'image_focal_x',
            fallback.focalX,
            0,
            1,
            '水平焦点'
        ),
        focalY: numericField(
            fields,
            'image_focal_y',
            fallback.focalY,
            0,
            1,
            '垂直焦点'
        ),
        zoom: numericField(fields, 'image_zoom', fallback.zoom, 1, 3, '图片缩放'),
        rotation: rotation as WikiImageTransform['rotation']
    };
}

export function parseWikiMediaRevision(
    fields: UploadFields,
    fallback: number
): number {
    const raw = fields.expected_revision;
    const revision = raw === undefined || raw === '' ? fallback : Number(raw);
    if (!Number.isSafeInteger(revision) || revision < 0) {
        throw Object.assign(new Error('媒体版本无效'), { status: 400 });
    }
    return revision;
}
