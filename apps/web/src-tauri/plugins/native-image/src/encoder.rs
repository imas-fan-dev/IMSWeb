use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{Error, NativeDecodedImage, NativePrepareOptions, PreparedImage, Result};

pub(crate) fn encode_decoded_image(
    decoded: NativeDecodedImage,
    options: &NativePrepareOptions,
) -> Result<PreparedImage> {
    let rgba_path = PathBuf::from(&decoded.rgba_file_path);
    let output_path = PathBuf::from(&decoded.output_file_path);
    let temporary_output = output_path.with_extension("webp.tmp");

    let result = (|| {
        validate_descriptor(&decoded, options)?;
        let expected_bytes = decoded
            .width
            .checked_mul(decoded.height)
            .and_then(|pixels| pixels.checked_mul(4))
            .ok_or(Error::InvalidDecodedImage)? as usize;
        let mut rgba = fs::read(&rgba_path).map_err(|_| Error::InvalidDecodedImage)?;
        if rgba.len() != expected_bytes {
            return Err(Error::InvalidDecodedImage);
        }
        unpremultiply_rgba(&mut rgba);

        let mut quality = options.quality.clamp(options.minimum_quality, 100.0);
        while quality + f32::EPSILON >= options.minimum_quality {
            let encoded =
                webp::Encoder::from_rgba(&rgba, decoded.width, decoded.height).encode(quality);
            if !encoded.is_empty() && encoded.len() as u64 <= options.max_output_bytes {
                fs::write(&temporary_output, &*encoded).map_err(|_| Error::WriteFailed)?;
                fs::rename(&temporary_output, &output_path).map_err(|_| Error::WriteFailed)?;
                return Ok(PreparedImage {
                    id: decoded.id,
                    file_path: decoded.output_file_path,
                    file_name: decoded.file_name,
                    mime_type: "image/webp".into(),
                    byte_length: encoded.len() as u64,
                    width: decoded.width,
                    height: decoded.height,
                    expires_at: decoded.expires_at,
                });
            }
            quality -= 8.0;
        }
        Err(Error::OutputTooLarge)
    })();

    let _ = fs::remove_file(&rgba_path);
    if result.is_err() {
        let _ = fs::remove_file(&output_path);
        let _ = fs::remove_file(&temporary_output);
    }
    result
}

fn validate_descriptor(decoded: &NativeDecodedImage, options: &NativePrepareOptions) -> Result<()> {
    if !valid_id(&decoded.id)
        || decoded.width == 0
        || decoded.height == 0
        || decoded.width > options.max_pixel_size
        || decoded.height > options.max_pixel_size
        || !decoded.file_name.ends_with(".webp")
    {
        return Err(Error::InvalidDecodedImage);
    }

    let rgba_path = Path::new(&decoded.rgba_file_path);
    let output_path = Path::new(&decoded.output_file_path);
    let expected_rgba_name = format!("{}.rgba", decoded.id);
    let expected_output_name = format!("{}.webp", decoded.id);
    if rgba_path.file_name().and_then(|name| name.to_str()) != Some(&expected_rgba_name)
        || output_path.file_name().and_then(|name| name.to_str()) != Some(&expected_output_name)
        || rgba_path.parent() != output_path.parent()
    {
        return Err(Error::InvalidDecodedImage);
    }
    Ok(())
}

fn valid_id(value: &str) -> bool {
    value.len() == 36
        && value.chars().enumerate().all(|(index, character)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                character == '-'
            } else {
                character.is_ascii_hexdigit()
            }
        })
}

fn unpremultiply_rgba(rgba: &mut [u8]) {
    for pixel in rgba.chunks_exact_mut(4) {
        let alpha = u32::from(pixel[3]);
        if alpha == 0 || alpha == 255 {
            continue;
        }
        for channel in &mut pixel[..3] {
            let value = ((u32::from(*channel) * 255) + (alpha / 2)) / alpha;
            *channel = value.min(255) as u8;
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(0);

    use super::*;
    use crate::{MediaKind, PrepareOptions};

    fn fixture() -> (NativeDecodedImage, NativePrepareOptions) {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let sequence = NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed);
        let directory =
            std::env::temp_dir().join(format!("imsweb-native-image-{nonce}-{sequence}"));
        fs::create_dir_all(&directory).unwrap();
        let id = "12345678-1234-1234-1234-123456789abc";
        let rgba_file_path = directory.join(format!("{id}.rgba"));
        let output_file_path = directory.join(format!("{id}.webp"));
        (
            NativeDecodedImage {
                id: id.into(),
                rgba_file_path: rgba_file_path.to_string_lossy().into_owned(),
                output_file_path: output_file_path.to_string_lossy().into_owned(),
                file_name: "avatar.webp".into(),
                width: 2,
                height: 2,
                expires_at: "2026-01-01T00:00:00Z".into(),
            },
            NativePrepareOptions {
                source_path: String::new(),
                max_pixel_size: 2048,
                max_input_pixels: 70_000_000,
                max_output_bytes: 5 * 1024 * 1024,
                quality: 92.0,
                minimum_quality: 76.0,
                expires_after_seconds: 3600,
                file_name_prefix: "avatar".into(),
            },
        )
    }

    #[test]
    fn policies_match_the_existing_upload_limits() {
        let avatar = PrepareOptions {
            media_kind: MediaKind::PlatformAvatar,
        }
        .into_native(String::new());
        let card = PrepareOptions {
            media_kind: MediaKind::FudabaCardFront,
        }
        .into_native(String::new());
        let namecard = PrepareOptions {
            media_kind: MediaKind::GuestNamecard,
        }
        .into_native(String::new());

        const MIB: u64 = 1024 * 1024;
        assert_eq!(avatar.max_output_bytes, 5 * MIB);
        assert_eq!(card.max_output_bytes, 8 * MIB);
        assert_eq!(namecard.max_output_bytes, 3 * MIB);
    }

    #[test]
    fn encodes_rgba_to_webp_and_removes_the_intermediate() {
        let (decoded, options) = fixture();
        fs::write(
            &decoded.rgba_file_path,
            [
                255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 128,
            ],
        )
        .unwrap();

        let prepared = encode_decoded_image(decoded.clone(), &options).unwrap();
        let bytes = fs::read(&prepared.file_path).unwrap();

        assert_eq!(&bytes[..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WEBP");
        assert!(!Path::new(&decoded.rgba_file_path).exists());
        let _ = fs::remove_dir_all(Path::new(&prepared.file_path).parent().unwrap());
    }

    #[test]
    fn rejects_an_invalid_rgba_length_and_cleans_it_up() {
        let (decoded, options) = fixture();
        fs::write(&decoded.rgba_file_path, [0, 1, 2]).unwrap();

        assert!(matches!(
            encode_decoded_image(decoded.clone(), &options),
            Err(Error::InvalidDecodedImage)
        ));
        assert!(!Path::new(&decoded.rgba_file_path).exists());
        let _ = fs::remove_dir_all(Path::new(&decoded.rgba_file_path).parent().unwrap());
    }
}
