import * as vscode from "vscode";
import fs from "fs";
import {editorCss, editorCssCopy} from "./ENV";
import {attemptToUpdateSticker} from "./StickerUpdateService";
import {Sticker} from "./extension";

export enum InstallStatus {
  INSTALLED,
  NOT_INSTALLED,
  FAILURE,
}

const stickerComment = "/* Stickers */";
const wallpaperComment = "/* Background Image */";

const getStickerIndex = (currentCss: string) => currentCss.indexOf(stickerComment);
const getWallpaperIndex = (currentCss: string) => currentCss.indexOf(wallpaperComment);


function buildWallpaperCss({
                             backgroundImageURL: backgroundUrl,
                             wallpaperImageURL: wallpaperURL,
                             backgroundAnchoring,
                           }: DokiStickers): string {
  return `${wallpaperComment}
  [id="workbench.parts.editor"] .split-view-view .editor-container .editor-instance>.monaco-editor .overflow-guard>.monaco-scrollable-element>.monaco-editor-background{background: none;}

  [id="workbench.parts.editor"] .split-view-view .editor-container .editor-instance>.monaco-editor  .overflow-guard>.monaco-scrollable-element::before,
  .overflow-guard, 
  .tab, 
  .tabs-container,
  .split-view-view, 
  .monaco-pane-view,
  .composite.title, 
  .content, 
  .monaco-select-box, 
  .pane-header, 
  [id="workbench.view.explorer"] .monaco-list-rows, 
  .minimap-decorations-layer,
  .xterm-cursor-layer,
  .decorationsOverviewRuler,
  .monaco-breadcrumbs,
  .monaco-split-view2>.monaco-scrollable-element>.split-view-container>.split-view-view .monaco-list-rows
  {
    background-image: url('${wallpaperURL}') !important;
    background-position: ${backgroundAnchoring} !important;
    background-attachment: fixed !important;
    background-repeat: no-repeat !important;
    background-size: cover !important;
  }

  .monaco-icon-label-container {
    background: none !important;
  }

  .monaco-workbench .part.editor > .content {
    background-image: url('${backgroundUrl}') !important;
    background-position: ${backgroundAnchoring};
    background-attachment: fixed;
    background-repeat: no-repeat;
    background-size: cover;
    content:'';
    z-index:9001;
    width:100%;
    height:100%;
    opacity:1;
}
  `;
}

function buildStickerCss({
                           stickerDataURL: stickerUrl,
                         }: DokiStickers): string {
  const style =
    "content:'';pointer-events:none;position:absolute;z-index:9001;width:100%;height:100%;background-position:100% 97%;background-repeat:no-repeat;opacity:1;";
  return `
  ${stickerComment}
  body > .monaco-workbench > .monaco-grid-view > .monaco-grid-branch-node > .monaco-split-view2 > .split-view-container::after,
  body > .monaco-workbench > .monaco-grid-view > .monaco-grid-branch-node > .monaco-split-view2 > .monaco-scrollable-element > .split-view-container::after
  {background-image: url('${stickerUrl}');${style}}

  .notifications-toasts {
    z-index: 9002 !important;
  }
`;
}

function buildCSSWithStickers(dokiStickers: DokiStickers): string {
  return `${getStickerScrubbedCSS()}${buildStickerCss(dokiStickers)}`;
}

function buildCSSWithWallpaper(dokiStickers: DokiStickers): string {
  return `${getWallpaperScrubbedCSS()}${buildWallpaperCss(dokiStickers)}`;
}

function installEditorStyles(styles: string) {
  fs.writeFileSync(editorCss, styles, "utf-8");
}

function canWrite(): boolean {
  try {
    fs.accessSync(editorCss, fs.constants.W_OK);
    return true;
  } catch (error) {
    return false;
  }
}

export interface DokiStickers {
  stickerDataURL: string;
  backgroundImageURL: string;
  wallpaperImageURL: string;
  backgroundAnchoring: string;
}

export async function installStickers(
  sticker: Sticker,
  context: vscode.ExtensionContext
): Promise<boolean> {
  return installStyles(
    sticker,
    context,
    stickersAndWallpaper => buildCSSWithStickers(stickersAndWallpaper));
}

export async function installWallPaper(
  sticker: Sticker,
  context: vscode.ExtensionContext
): Promise<boolean> {
  return installStyles(
    sticker,
    context,
    stickersAndWallpaper => buildCSSWithWallpaper(stickersAndWallpaper));
}

async function installStyles(
  sticker: Sticker,
  context: vscode.ExtensionContext,
  cssDecorator: (assets: DokiStickers) => string
): Promise<boolean> {
  if (canWrite()) {
    try {
      const stickersAndWallpaper = await attemptToUpdateSticker(
        context,
        sticker
      );
      const stickerStyles = cssDecorator(stickersAndWallpaper);
      installEditorStyles(stickerStyles);
      return true;
    } catch (e) {
      console.error("Unable to install sticker!", e);
    }
  }

  return false;
}

function getScrubbedCSS() {
  const currentCss = fs.readFileSync(editorCss, "utf-8");
  const stickerIndex = getStickerIndex(currentCss);
  const trimmedCss = trimCss(currentCss, stickerIndex);
  return trimCss(trimmedCss, getWallpaperIndex(trimmedCss));
}

function scrubCssOfAsset(getAssetOneIndex: (currentCss: string) => number,
                         getAssetToRemoveIndex: (currentCss: string) => number) {
  const currentCss = fs.readFileSync(editorCss, "utf-8");
  const otherAssetIndex = getAssetOneIndex(currentCss);
  const assetToRemoveIndex = getAssetToRemoveIndex(currentCss);
  if (otherAssetIndex < 0) {
    return trimCss(currentCss, assetToRemoveIndex);
  } else if (assetToRemoveIndex > -1) {
    return currentCss.substring(0, assetToRemoveIndex) + (
      assetToRemoveIndex < otherAssetIndex ?
        '\n' + currentCss.substring(otherAssetIndex, currentCss.length) :
        ''
    );
  }
  return currentCss;
}

function getWallpaperScrubbedCSS() {
  return scrubCssOfAsset(
    getStickerIndex,
    getWallpaperIndex,
  );
}
function getStickerScrubbedCSS() {
  return scrubCssOfAsset(
    getWallpaperIndex,
    getStickerIndex,
  );
}

function trimCss(currentCss: string, index: number): string {
  if (index >= 0) {
    return currentCss.substr(0, index).trim();
  }
  return currentCss;
}

const scrubCSSFile = () => {
  const scrubbedCSS = getScrubbedCSS();
  fs.writeFileSync(editorCss, scrubbedCSS, "utf-8");
};

// :(
export function removeStickers(): InstallStatus {
  if (canWrite()) {
    try {
      if (fs.existsSync(editorCssCopy)) {
        fs.unlinkSync(editorCssCopy);
        scrubCSSFile();
        return InstallStatus.INSTALLED;
      }
      scrubCSSFile();
      return InstallStatus.NOT_INSTALLED;
    } catch (e) {
      console.error("Unable to remove stickers!", e);
      return InstallStatus.FAILURE;
    }
  }

  return InstallStatus.FAILURE;
}
