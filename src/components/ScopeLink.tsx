import type { ScopeKind } from "../lib/songs";
import { people } from "../lib/songs";
import type { Scope } from "../App";

type Props = {
  kind: ScopeKind;
  value: string;
  onScope: (s: NonNullable<Scope>) => void;
  /** "A / B" を名義ごとに分けてリンクにする */
  split?: boolean;
  /** 一覧用: 下線をホバー時だけにする */
  subtle?: boolean;
};

/** クリックするとその値で一覧を絞り込むテキスト */
export function ScopeLink({ kind, value, onScope, split, subtle }: Props) {
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
            className={
              subtle
                ? "text-left hover:text-white hover:underline"
                : "text-left underline decoration-dotted decoration-1 underline-offset-4 hover:text-accent hover:decoration-solid"
            }
            title={`「${n}」で絞り込む`}
          >
            {n}
          </button>
        </span>
      ))}
    </>
  );
}
