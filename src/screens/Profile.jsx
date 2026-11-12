import { Check, ChevronLeft, ChevronRight, Flag, RefreshCw } from 'lucide-preact'
import { BUILD_TIME, refreshApp } from '../lib/update'
import { MONTHS_GEN } from '../lib/plan'
import { ATHLETES, plan } from '../lib/plan'

// Профиль: кто ты (выбор атлета) и ссылка на план.
export function Profile({ athlete, back = '#/', onPick }) {
  return (
    <main>
      <div class="nav">
        <a class="back" href={back} onClick={(e) => { if (back !== '#/') { e.preventDefault(); history.back() } }}><ChevronLeft size={26} strokeWidth={2.25} />Назад</a>
      </div>
      <h1 class="large-title" tabindex="-1" style="margin:8px 4px 0">Профиль</h1>

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

      <h2 class="section-title">Обновления</h2>
      <div class="card list plain">
        <button class="cell" onClick={() => refreshApp()}>
          <span class="badge bg-z1"><RefreshCw size={18} strokeWidth={2} /></span>
          <span class="cell-text"><span class="cell-title" style="display:block">Проверить обновления</span></span>
        </button>
      </div>
      <p class="footnote">
        {BUILD_TIME && <>Версия плана от {fmtBuild(BUILD_TIME)}. </>}
        На любом экране можно потянуть вниз — план подтянется с сервера
      </p>
    </main>
  )
}

const fmtBuild = (iso) => {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
