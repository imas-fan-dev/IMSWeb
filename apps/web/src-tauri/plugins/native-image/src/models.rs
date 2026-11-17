use serde::{Deserialize, Serialize};

#[cfg(any(target_os = "ios", test))]
const MEBIBYTE: u64 = 1024 * 1024;

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum MediaKind {
    PlatformAvatar,
    FudabaCardFront,
    FudabaCardBack,
    GuestNamecard,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareOptions {
    pub media_kind: MediaKind,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseOptions {
    pub id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedImage {
    pub id: String,
    pub file_path: String,
    pub file_name: String,
    pub mime_type: String,
    pub byte_length: u64,
    pub width: u32,
    pub height: u32,
    pub expires_at: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResult {
    pub removed: u64,
}

#[cfg(any(target_os = "ios", test))]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativePrepareOptions {
    pub source_path: String,
    pub max_pixel_size: u32,
    pub max_input_pixels: u64,
    pub max_output_bytes: u64,
    pub quality: f32,
    pub minimum_quality: f32,
    pub expires_after_seconds: u64,
    pub file_name_prefix: String,
}

#[cfg(any(target_os = "ios", test))]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeDecodedImage {
    pub id: String,
    pub rgba_file_path: String,
    pub output_file_path: String,
    pub file_name: String,
    pub width: u32,
    pub height: u32,
    pub expires_at: String,
}

#[cfg(any(target_os = "ios", test))]
impl PrepareOptions {
    pub(crate) fn into_native(self, source_path: String) -> NativePrepareOptions {
        match self.media_kind {
            MediaKind::PlatformAvatar => NativePrepareOptions {
                source_path: source_path.clone(),
                max_pixel_size: 2048,
                max_input_pixels: 70_000_000,
                max_output_bytes: 5 * MEBIBYTE,
                quality: 92.0,
                minimum_quality: 76.0,
                expires_after_seconds: 60 * 60,
                file_name_prefix: "avatar".into(),
            },
            MediaKind::FudabaCardFront => NativePrepareOptions {
                source_path: source_path.clone(),
                max_pixel_size: 3200,
                max_input_pixels: 70_000_000,
                max_output_bytes: 8 * MEBIBYTE,
                quality: 92.0,
                minimum_quality: 76.0,
                expires_after_seconds: 60 * 60,
                file_name_prefix: "card-front".into(),
            },
            MediaKind::FudabaCardBack => NativePrepareOptions {
                source_path: source_path.clone(),
                max_pixel_size: 3200,
                max_input_pixels: 70_000_000,
                max_output_bytes: 8 * MEBIBYTE,
                quality: 92.0,
                minimum_quality: 76.0,
                expires_after_seconds: 60 * 60,
                file_name_prefix: "card-back".into(),
            },
            MediaKind::GuestNamecard => NativePrepareOptions {
                source_path,
                max_pixel_size: 3200,
                max_input_pixels: 70_000_000,
                max_output_bytes: 3 * MEBIBYTE,
                quality: 92.0,
                minimum_quality: 76.0,
                expires_after_seconds: 60 * 60,
                file_name_prefix: "namecard".into(),
            },
        }
    }
}
