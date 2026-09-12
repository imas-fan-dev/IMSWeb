use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGlassColor {
    pub red: f64,
    pub green: f64,
    pub blue: f64,
    pub alpha: f64,
}

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
    #[serde(default)]
    pub hidden: bool,
    pub items: Vec<NativeGlassTabItem>,
    #[serde(default)]
    pub selected_color: Option<NativeGlassColor>,
    pub selected_index: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOptions {
    pub dark: bool,
    #[serde(default)]
    pub hidden: bool,
    #[serde(default)]
    pub selected_color: Option<NativeGlassColor>,
    pub selected_index: Option<usize>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGlassStatus {
    pub reason: Option<String>,
    pub supported: bool,
}
