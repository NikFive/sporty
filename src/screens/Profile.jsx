import { Check, ChevronLeft, ChevronRight, Flag } from 'lucide-preact'
import { ATHLETES, plan } from '../lib/plan'

// Профиль: кто ты (выбор атлета) и ссылка на план.
export function Profile({ athlete, back = '#/', onPick }) {
  return (
    <main>
      <div class="nav">
        <a class="back" href={back} onClick={(e) => { if (back !== '#/') { e.preventDefault(); history.back() } }}><ChevronLeft size={26} strokeWidth={2.25} />Назад</a>
      </div>
      <h1 class="large-title" style="margin:8px 4px 0">Профиль</h1>

      <h2 class="section-title">Кто ты</h2>
      <div class="card list plain">
        {ATHLETES.map((a) => (
          <button class="cell" key={a} onClick={() => onPick(a)} aria-pressed={a === athlete}>
            <span class="pick-name">{plan.athletes[a].name}</span>
            {a === athlete && <Check size={22} strokeWidth={2.5} class="check" />}
          </button>
        ))}
      </div>
      <p class="footnote">Запомним на этом телефоне. После выбора вернёмся назад</p>

      <div class="card list" style="margin-top:24px">
        <a class="cell" href="#/plan">
          <span class="badge bg-z4"><Flag size={18} strokeWidth={2} /></span>
          <span class="cell-text"><span class="cell-title" style="display:block">План до старта</span></span>
          <ChevronRight class="chev" size={18} strokeWidth={2.5} />
        </a>
      </div>
    </main>
  )
}
