import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  deterministicObjectId,
  syncIosAppIcon,
  wireAppIconIntoProject,
} from "@/scripts/sync-ios-app-icon.js"

const PROJECT_FIXTURE = `// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 77;
	objects = {

/* Begin PBXBuildFile section */
		2564A80D42D0FA36B44470BC /* Assets.xcassets in Resources */ = {isa = PBXBuildFile; fileRef = B65F8F561608F6410452DB36 /* Assets.xcassets */; };
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
		B65F8F561608F6410452DB36 /* Assets.xcassets */ = {isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>"; };
/* End PBXFileReference section */

/* Begin PBXGroup section */
		315E204DA43DFF3208527D1C = {
			isa = PBXGroup;
			children = (
				B65F8F561608F6410452DB36 /* Assets.xcassets */,
			);
			sourceTree = "<group>";
		};
/* End PBXGroup section */

/* Begin PBXProject section */
		A30B6E33D11CB16D705EDA7E /* Project object */ = {
			isa = PBXProject;
			mainGroup = 315E204DA43DFF3208527D1C;
		};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
		EB50A7BC4680776F24697F75 /* Resources */ = {
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				2564A80D42D0FA36B44470BC /* Assets.xcassets in Resources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXResourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
		9A92F8E8B247F0BB3F68F636 /* debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
			};
			name = debug;
		};
/* End XCBuildConfiguration section */
	};
	rootObject = A30B6E33D11CB16D705EDA7E /* Project object */;
}
`

const PROJECT_RELATIVE_PATH =
  "src-tauri/gen/apple/imsweb.xcodeproj/project.pbxproj"
const CONTROLLED_ICON_RELATIVE_PATH =
  "src-tauri/icon-sources/ios-liquid-glass/AppIcon.icon"

function createWebRoot() {
  const webRoot = mkdtempSync(join(tmpdir(), "imsweb-sync-app-icon-"))
  const iconDirectory = join(webRoot, CONTROLLED_ICON_RELATIVE_PATH)
  mkdirSync(join(iconDirectory, "Assets"), { recursive: true })
  writeFileSync(join(iconDirectory, "icon.json"), "{}\n")
  for (const layer of ["At.png", "Wordmark.png", "Outline.png"]) {
    writeFileSync(join(iconDirectory, "Assets", layer), `${layer}\n`)
  }
  return webRoot
}

function writeProject(webRoot: string, projectText: string) {
  const projectPath = join(webRoot, PROJECT_RELATIVE_PATH)
  mkdirSync(join(projectPath, ".."), { recursive: true })
  writeFileSync(projectPath, projectText)
  return projectPath
}

function readProject(webRoot: string) {
  return readFileSync(join(webRoot, PROJECT_RELATIVE_PATH), "utf8")
}

function countOccurrences(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0
}

describe("iOS app icon synchronization", () => {
  it("derives stable 24-hex-digit Xcode object ids", () => {
    expect(deterministicObjectId("imsweb")).toMatch(/^[0-9A-F]{24}$/)
    expect(deterministicObjectId("imsweb")).toBe(
      deterministicObjectId("imsweb")
    )
    expect(deterministicObjectId("imsweb")).not.toBe(
      deterministicObjectId("imsweb:other")
    )
  })

  it("skips every write when the generated Apple project is absent", () => {
    const webRoot = mkdtempSync(join(tmpdir(), "imsweb-sync-app-icon-"))
    try {
      const result = syncIosAppIcon({ webRoot })

      expect(result).toEqual({ skipped: true, copied: false, patched: false })
      expect(existsSync(join(webRoot, "src-tauri/gen"))).toBe(false)
    } finally {
      rmSync(webRoot, { force: true, recursive: true })
    }
  })

  it("copies the icon document and wires the project once", () => {
    const webRoot = createWebRoot()
    writeProject(webRoot, PROJECT_FIXTURE)

    try {
      const result = syncIosAppIcon({ webRoot })

      expect(result).toEqual({ skipped: false, copied: true, patched: true })
      expect(
        existsSync(join(webRoot, `${CONTROLLED_ICON_RELATIVE_PATH}/icon.json`))
      ).toBe(true)
      expect(
        existsSync(
          join(webRoot, "src-tauri/gen/apple/AppIcon.icon/Assets/At.png")
        )
      ).toBe(true)

      const projectText = readProject(webRoot)
      expect(projectText).toContain(
        "lastKnownFileType = folder.icon; path = AppIcon.icon;"
      )
      expect(countOccurrences(projectText, /AppIcon\.icon in Resources/g)).toBe(
        2
      )
      expect(projectText).toContain(
        "ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;"
      )
    } finally {
      rmSync(webRoot, { force: true, recursive: true })
    }
  })

  it("leaves the project byte-identical on a second run", () => {
    const webRoot = createWebRoot()
    writeProject(webRoot, PROJECT_FIXTURE)

    try {
      syncIosAppIcon({ webRoot })
      const once = readProject(webRoot)
      const onceMode =
        statSync(join(webRoot, PROJECT_RELATIVE_PATH)).mode & 0o777

      const second = syncIosAppIcon({ webRoot })
      const twice = readProject(webRoot)

      expect(second).toEqual({ skipped: false, copied: true, patched: false })
      expect(twice).toEqual(once)
      expect(statSync(join(webRoot, PROJECT_RELATIVE_PATH)).mode & 0o777).toBe(
        onceMode
      )
      expect(countOccurrences(twice, /AppIcon\.icon in Resources/g)).toBe(
        countOccurrences(once, /AppIcon\.icon in Resources/g)
      )
    } finally {
      rmSync(webRoot, { force: true, recursive: true })
    }
  })

  it("throws instead of writing when the AppIcon build setting is missing", () => {
    const webRoot = createWebRoot()
    const projectPath = writeProject(
      webRoot,
      PROJECT_FIXTURE.replace(
        "\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;\n",
        ""
      )
    )

    try {
      expect(() => syncIosAppIcon({ webRoot })).toThrow(
        /ASSETCATALOG_COMPILER_APPICON_NAME/
      )
      expect(readFileSync(projectPath, "utf8")).not.toContain(
        "AppIcon.icon in Resources"
      )
    } finally {
      rmSync(webRoot, { force: true, recursive: true })
    }
  })

  it("rejects a project without a mainGroup instead of guessing", () => {
    expect(() =>
      wireAppIconIntoProject(
        PROJECT_FIXTURE.replace(
          "\t\t\tmainGroup = 315E204DA43DFF3208527D1C;\n",
          ""
        )
      )
    ).toThrow(/mainGroup/)
  })
})
