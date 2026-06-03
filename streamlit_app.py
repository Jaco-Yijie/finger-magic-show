from __future__ import annotations

from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components


ROOT = Path(__file__).parent
APP_HTML = ROOT / "streamlit_static" / "app.html"
ASSET_BASE_URL = (
    "https://cdn.jsdelivr.net/gh/Jaco-Yijie/finger-magic-show@main/public/mediapipe"
)


def build_asset_script() -> str:
    return f"""
    <script>
      window.FINGER_MAGIC_ASSETS = {{
        wasmLoaderPath: "{ASSET_BASE_URL}/wasm/vision_wasm_internal.js",
        wasmBinaryPath: "{ASSET_BASE_URL}/wasm/vision_wasm_internal.wasm",
        modelAssetPath: "{ASSET_BASE_URL}/hand_landmarker.task",
      }};
    </script>
    """


def load_app_html() -> str:
    html = APP_HTML.read_text(encoding="utf-8")
    return html.replace("<!-- FINGER_MAGIC_ASSETS -->", build_asset_script())


st.set_page_config(page_title="指尖魔法秀", page_icon="✨", layout="wide")
st.markdown(
    """
    <style>
      html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"] {
        margin: 0;
        padding: 0;
        background: #050608;
      }

      [data-testid="stHeader"], [data-testid="stToolbar"], footer {
        display: none;
      }

      .block-container {
        padding: 0;
        max-width: none;
      }

      iframe {
        display: block;
        border: 0;
      }
    </style>
    """,
    unsafe_allow_html=True,
)

components.html(load_app_html(), height=900, scrolling=False)
