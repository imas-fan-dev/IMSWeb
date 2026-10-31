import { existsSync, readFileSync, writeFileSync } from "node:fs"

export function androidReleaseAllowsCleartext(environment, buildEnvironment) {
  if (environment.IMS_ALLOW_INSECURE_LAN_APP_ORIGIN !== "1") return false
  return [
    buildEnvironment.VITE_IMS_API_ORIGIN,
    buildEnvironment.VITE_IMS_PUBLIC_SITE_ORIGIN,
    buildEnvironment.VITE_IMS_MAP_TRANSPORT_ORIGIN,
  ].some((origin) => origin.startsWith("http://"))
}

export function configureGeneratedAndroidCleartext({
  environment,
  buildEnvironment,
  gradlePath,
}) {
  if (!existsSync(gradlePath)) return false

  const desired = String(
    androidReleaseAllowsCleartext(environment, buildEnvironment)
  )
  const placeholder =
    /manifestPlaceholders\["usesCleartextTraffic"\] = "(?:true|false)"/
  const source = readFileSync(gradlePath, "utf8")
  if (!placeholder.test(source)) {
    throw new Error("Cannot locate Android cleartext manifest placeholder")
  }
  const updated = source.replace(
    placeholder,
    `manifestPlaceholders["usesCleartextTraffic"] = "${desired}"`
  )
  if (updated !== source) writeFileSync(gradlePath, updated)
  return desired === "true"
}
