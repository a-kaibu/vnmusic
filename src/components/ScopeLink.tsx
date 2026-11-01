import type { ScopeKind } from "../lib/songs";
import { people } from "../lib/songs";
import type { Scope } from "../App";

type Props = {
  kind: ScopeKind;
  value: string;
  onScope: (s: NonNullable<Scope>) => void;
  /** "A / B" を名義ごとに分けてリンクにする */
  split?: boolean;
  className?: string;
};

/** クリックするとその値で一覧を絞り込むテキスト */
export function ScopeLink({ kind, value, onScope, split, className = "" }: Props) {
  if (!value) return null;
  const names = split ? people(value) : [value];
  return (
    <>
      {names.map((n, i) => (
        <span key={n}>
          {i > 0 && <span className="text-muted"> / </span>}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onScope({ kind, name: n });
            }}
            className={`text-left hover:text-white hover:underline ${className}`}
            title={`この${kind === "year" ? "年" : ""}で絞り込む`}
          >
            {n}
          </button>
        </span>
      ))}
    </>
  );
}
