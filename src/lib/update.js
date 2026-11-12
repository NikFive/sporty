import { registerSW } from 'virtual:pwa-register'

// Обновление приложения и плана.
// План вшит в сборку, поэтому «обновить тренировки» = подтянуть новую версию сервис-воркера.
// iOS держит PWA в памяти и сам почти не проверяет обновления — проверяем сами:
// при старте, при каждом возвращении в приложение и раз в 30 минут.

let registration = null
const FLAG = 'sporty.refreshed'

registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    registration = reg || null
    if (!reg) return
    const check = () => reg.update().catch(() => {})
    setInterval(check, 30 * 60_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

// registerType: autoUpdate → новый воркер сразу активируется; когда он берёт управление,
// перезагружаем страницу (один раз), чтобы показать свежий план.
let reloading = false
const hadController = !!navigator.serviceWorker?.controller // при первой установке не перезагружаем
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (reloading || !hadController) return
  reloading = true
  location.reload()
})

const waitForController = (ms) =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), ms)
    navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); resolve(true) }, { once: true })
  })

/**
 * «Потянуть, чтобы обновить»: спрашиваем сервер про новую версию.
 * Есть новая → ждём активации (перезагрузит controllerchange). Нет → просто перезагружаем.
 */
export async function refreshApp() {
  try {
    sessionStorage.setItem(FLAG, '1')
  } catch { /* приватный режим */ }
  const reg = registration || (await navigator.serviceWorker?.getRegistration?.())
  if (reg) {
    try {
      await reg.update()
    } catch { /* офлайн — перезагрузим из кэша */ }
    if (reg.installing || reg.waiting) {
      reloading = true
      await waitForController(8000)
    }
  }
  location.reload()
}

// После перезагрузки по жесту — короткое «Обновлено».
export function consumeRefreshedFlag() {
  try {
    const v = sessionStorage.getItem(FLAG)
    sessionStorage.removeItem(FLAG)
    return !!v
  } catch {
    return false
  }
}

// eslint-disable-next-line no-undef
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : null
