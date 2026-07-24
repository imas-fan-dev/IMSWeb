import type { WikiIdol } from "@/domains/wiki/models";

export interface AgencyTemplateProps {
  agency: string;
  agencyColor: string;
  idols: WikiIdol[];
}

export interface AgencyUnit {
  name: string;
  icon?: string;
  color: string;
  members: readonly string[];
}

const LEGACY_DEFAULT_COLORS = new Set(["", "#ff8b94", "#ffe4e8"]);

export function idolForMember(idols: WikiIdol[], member: string) {
  return idols.find((idol) => idol.folderName === member || idol.name === member);
}

export function resolvedIdolColor(idol: WikiIdol | undefined, fallback: string) {
  const color = idol?.color ?? "";
  return LEGACY_DEFAULT_COLORS.has(color) ? fallback : color;
}

export function IdolTile(props: {
  agency: string;
  idol?: WikiIdol;
  fallbackIdolName?: string;
  displayName: string;
  color: string;
  lightName?: boolean;
}) {
  const idolName = props.idol?.name ?? props.fallbackIdolName ?? props.displayName;
  return (
    <a
      href={`/story?agency=${encodeURIComponent(props.agency)}&idol=${encodeURIComponent(idolName)}`}
      class={`idol-card${props.lightName ? " light-name" : ""}`}
      data-name={props.displayName.toLocaleLowerCase()}
      style={`--idol-color: ${props.color};`}
    >
      {props.idol?.avatarUrl ? (
        <img
          src={props.idol.avatarUrl}
          alt={props.displayName}
          class="idol-img"
          style={props.idol.avatarFit === "contain" ? "object-fit:contain;padding:16%;" : undefined}
        />
      ) : (
        <div
          class="idol-img"
          style="background-color: #f4f6f9; border: 4px solid var(--idol-color, #ccc); display: flex; align-items: center; justify-content: center;"
        >
          <span
            style="color: var(--idol-color, #888); font-weight: 900; font-size: 1.1rem; text-align: center; padding: 5px; line-height: 1.2;"
          >
            {props.displayName}
          </span>
        </div>
      )}
      <div class="idol-name">{props.displayName}</div>
    </a>
  );
}

export function UnitLayout(props: AgencyTemplateProps & {
  units: readonly AgencyUnit[];
  names: Readonly<Record<string, string>>;
  namespace: string;
  sectionClass?: string;
  titleClass?: string;
  gridClass?: string;
  logoClass?: string;
  lightMembers?: ReadonlySet<string>;
  fallbackTiles?: boolean;
}) {
  const seen = new Set<string>();
  const sectionClass = props.sectionClass ?? `${props.namespace}-unit-section`;
  const titleClass = props.titleClass ?? `${props.namespace}-unit-title`;
  const gridClass = props.gridClass ?? `${props.namespace}-grid`;
  const logoClass = props.logoClass ?? `${props.namespace}-unit-logo`;

  return (
    <>
      {props.units.map((unit) => (
        <div class={sectionClass} style={`--unit-color: ${unit.color};`}>
          <div class={titleClass}>
            {unit.icon ? (
              <img
                src={`/icon/${props.namespace}/${unit.icon}`}
                alt={unit.name}
                class={logoClass}
                onerror="this.style.display='none'"
              />
            ) : null}
            <span>{unit.name}</span>
          </div>
          <div class={gridClass}>
            {unit.members.map((member) => {
              const idol = idolForMember(props.idols, member);
              if (!idol && !props.fallbackTiles) return null;
              seen.add(member);
              return (
                <IdolTile
                  agency={props.agency}
                  idol={idol}
                  fallbackIdolName={member}
                  displayName={props.names[member] ?? idol?.name ?? member}
                  color={resolvedIdolColor(idol, unit.color)}
                  lightName={props.lightMembers?.has(member)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export function GenericAgencyGrid(props: AgencyTemplateProps) {
  return (
    <div class="default-grid">
      {props.idols.map((idol) => (
        <IdolTile
          agency={props.agency}
          idol={idol}
          displayName={idol.name}
          color={resolvedIdolColor(idol, props.agencyColor)}
        />
      ))}
    </div>
  );
}

export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
