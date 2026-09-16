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

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGlassFrame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGlassMenuItem {
    pub id: String,
    pub icon: String,
    pub label: String,
    #[serde(default)]
    pub active: bool,
    #[serde(default)]
    pub badge: bool,
}

/// One floating map control drawn natively above the WebView. `frame` uses CSS
/// pixels relative to the WebView viewport; the iOS side maps that to UIKit
/// points. The tag is `kind` so both variants share one internally tagged union
/// across the Rust, Swift, and TypeScript boundaries.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "kind")]
pub enum NativeGlassControl {
    #[serde(rename = "icon-button", rename_all = "camelCase")]
    IconButton {
        id: String,
        icon: String,
        label: String,
        frame: NativeGlassFrame,
        corner_radius: f64,
        #[serde(default)]
        active: bool,
        #[serde(default)]
        disabled: bool,
    },
    #[serde(rename = "menu", rename_all = "camelCase")]
    Menu {
        id: String,
        icon: String,
        label: String,
        frame: NativeGlassFrame,
        corner_radius: f64,
        expanded: bool,
        panel_width: f64,
        items: Vec<NativeGlassMenuItem>,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetControlsArgs {
    pub controls: Vec<NativeGlassControl>,
    pub dark: bool,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGlassStatus {
    pub reason: Option<String>,
    pub supported: bool,
}
