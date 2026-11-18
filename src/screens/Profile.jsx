import { Activity, Check, ChevronLeft, ChevronRight, Flag, RefreshCw, Unlink } from 'lucide-preact'
import { connectUrl, disconnect, useWhoopStatus } from '../lib/whoop'
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

      <Whoop athlete={athlete} />

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

// WHOOP: подключить / отключить. Подключение — OAuth на сайте WHOOP, потом возвращаемся сюда.
function Whoop({ athlete }) {
  const st = useWhoopStatus(athlete)
  const name = plan.athletes[athlete].name
  const mine = st?.connected && st?.authorized
  const who = st?.profile ? [st.profile.firstName, st.profile.lastName].filter(Boolean).join(' ') : null
  return (
    <>
      <h2 class="section-title">WHOOP</h2>
      <div class="card list plain">
        {mine ? (
          <>
            <div class="cell">
              <span class="badge bg-z2"><Activity size={18} strokeWidth={2} /></span>
              <span class="cell-text">
                <span class="cell-title" style="display:block">Подключён</span>
                {who && <span class="cell-sub" style="display:block">{who}</span>}
              </span>
              <Check size={22} strokeWidth={2.5} class="check" />
            </div>
            <button class="cell" onClick={() => confirm(`Отключить WHOOP для ${name}?`) && disconnect(athlete)}>
              <span class="badge bg-mob"><Unlink size={18} strokeWidth={2} /></span>
              <span class="cell-text"><span class="cell-title is-danger" style="display:block">Отключить</span></span>
            </button>
          </>
        ) : (
          <a class={`cell${st && !st.configured ? ' is-disabled' : ''}`} href={st?.configured ? connectUrl(athlete) : undefined} aria-disabled={!st?.configured}>
            <span class="badge bg-z1"><Activity size={18} strokeWidth={2} /></span>
            <span class="cell-text">
              <span class="cell-title" style="display:block">{st?.connected ? 'Подключить на этом телефоне' : 'Подключить WHOOP'}</span>
              <span class="cell-sub" style="display:block">
                {st == null ? 'Нет связи с сервером' : !st.configured ? 'Скоро — сервер ещё настраивается' : `Аккаунт ${name}`}
              </span>
            </span>
            <ChevronRight class="chev" size={18} strokeWidth={2.5} />
          </a>
        )}
      </div>
      <p class="footnote">
        Берём восстановление, HRV, пульс покоя, сон и strain. На главной покажем, как скорректировать сегодняшнюю тренировку
      </p>
    </>
  )
}
