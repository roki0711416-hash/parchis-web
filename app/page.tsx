import Link from "next/link";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-neutral-50 via-white to-neutral-100">
      {/* subtle decorative blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-neutral-200/60 blur-3xl" />
        <div className="absolute top-24 -right-32 h-96 w-96 rounded-full bg-neutral-200/50 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 h-[28rem] w-[28rem] rounded-full bg-neutral-300/30 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-5 py-10 sm:py-14">
        {/* header */}
        <header className="flex items-start gap-4">
          <div className="mt-0.5 grid h-11 w-11 place-items-center rounded-2xl bg-neutral-900 text-white shadow-sm">
            <span className="text-lg font-bold" aria-hidden>
              P
            </span>
            <span className="sr-only">パルチス</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">パルチス（Parchís）</h1>
            <p className="mt-2 text-sm text-neutral-700">
              パルチスはスペイン発祥のボードゲームで、ルドー（Ludo）系のゲームです。
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              サクッと遊べるローカル対戦 / CPU対戦。モードを選んで開始。
            </p>
          </div>
        </header>

        {/* cards */}
        <div className="mt-8 space-y-5">
          <section className="rounded-3xl border border-neutral-200 bg-white/70 p-5 shadow-sm backdrop-blur sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-neutral-900">ルール要点</h2>
              <div className="text-xs text-neutral-500">短縮版</div>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-neutral-700">
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-neutral-400" />
                <span>目的: 自分の駒4つをすべてゴールへ</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-neutral-400" />
                <span>手番でサイコロを振り、出せる/動かせる駒を選んで進む</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-neutral-400" />
                <span>6で出陣（ヤード→スタート）できる</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-neutral-400" />
                <span>通常マスで捕獲すると+20の追加移動（選択式）</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-neutral-400" />
                <span>セーフマスは捕獲なし（満杯=2駒なら到着不可）</span>
              </li>
            </ul>
          </section>

          <section className="rounded-3xl border border-neutral-200 bg-white/70 p-5 shadow-sm backdrop-blur sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-neutral-900">モード選択</h2>
              <div className="text-xs text-neutral-500">/gameへ移動</div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ModeCard href="/game?mode=solo" title="ソロ" desc="人間（赤） vs CPU3" />
              <ModeCard href="/game?mode=local2" title="ローカル2人" desc="赤/青で対戦" />
              <ModeCard href="/game?mode=local3" title="ローカル3人" desc="赤/青/黄で対戦" />
              <ModeCard href="/game?mode=local4" title="ローカル4人" desc="全色で対戦" />
            </div>

            <p className="mt-4 text-xs text-neutral-600">
              ヒント: モバイルは縦向きでも盤面だけ回転します。
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

function ModeCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group relative rounded-2xl border border-neutral-200 bg-white px-4 py-4 shadow-sm transition
                 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md
                 active:translate-y-0 active:shadow-sm
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/20"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-base font-semibold text-neutral-900">{title}</div>
          <div className="mt-1 text-sm text-neutral-600">{desc}</div>
        </div>
        <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-neutral-900 text-white transition group-hover:scale-[1.02]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
