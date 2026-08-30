use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGlassTabItem {
    pub route: String,
    pub lucide_icon: String,
    pub title: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigureOptions {
    pub dark: bool,
    pub items: Vec<NativeGlassTabItem>,
    pub selected_index: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOptions {
    pub dark: bool,
    pub selected_index: usize,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGlassStatus {
    pub reason: Option<String>,
    pub supported: bool,
}
