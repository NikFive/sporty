# План тренировок — контракт данных

Весь план лежит в четырёх YAML-файлах в этой папке. Интерфейс (`src/`) только читает их: `src/lib/plan.js` склеивает файлы в один объект `plan` и считает дни через `getDay`.

> **Push в `main` сразу собирает и выкладывает сайт.** Перед коммитом всегда запускай `npm run validate`. Если проверка падает, сборка в CI тоже упадёт.

## Правила правки

- Меняй только `plan/*.yaml`. Код UI, `src/lib/plan.js` и схемы трогать не нужно.
- Даты пиши в кавычках, в формате `"YYYY-MM-DD"`.
- id (тренировок, шаблонов, событий) пиши латиницей в нижнем регистре: `bike_z2`, `base2`, `ski-feb`.
- Сначала найди подходящий рецепт в разделе [«Рецепты»](#рецепты) ниже.
- Закончил — запусти `npm run validate`. Ошибки сгруппированы по файлам, у каждой есть путь, например `overrides[0] (2026-12-03).day.vanya[0]: тренировка «run_z9» не найдена в workouts.yaml.`
- Подсказки и автодополнение в редакторе: первая строка каждого YAML подключает его JSON Schema (`# yaml-language-server: $schema=./schema/….schema.json`). Подробные описания полей лежат в `plan/schema/*.schema.json`.

## Файлы

| Файл | Что внутри | Схема |
|---|---|---|
| `settings.yaml` | `athletes`, `race`, `restDay`, `zones` | `schema/settings.schema.json` |
| `workouts.yaml` | `workouts`: библиотека тренировок | `schema/workouts.schema.json` |
| `templates.yaml` | `templates`: шаблоны недели | `schema/templates.schema.json` |
| `calendar.yaml` | `phases`, `milestones`, `events`, `overrides`, `weeks` | `schema/calendar.schema.json` |

### Кратко о полях

**settings.yaml**
- `athletes.<id>`: `name`, `about`. id атлета (`nikita`, `vanya`) служит слотом в днях, значением в `athletes: [...]` и ключом в `notes`.
- `race`: `title`, `date`, `tentative` (дата ориентировочная), `distances`.
- `restDay`: фиксированный выходной, `mon`…`sun`.
- `zones.z1…z5`: `name`, `rpe`, `talk`.

**workouts.yaml**: `workouts.<id>`:
- `sport`: `run | bike | swim | brick | strength | plyo | mobility | alt | race`.
- `title`, `main` (обязательные). `warmup`, `cooldown`, `why`, `ref` по желанию.
- `segments`: профиль для графика и статистики 80/20. Элементы: `[минуты, зона]` или повтор `{ x: 5, set: [[4, z5], [3, z1]] }`. Зоны: `z1…z5`, `str`, `plyo`, `mob`, `alt` (`alt` не идёт в объём).
- `split` (только для `sport: brick`, необязательно): `{ bike: 140, run: 40 }` — минуты вела и бега, в сумме = длительности `segments`. Нужен для аналитики по видам спорта; без него брик делится 75/25.
- `formula`: короткая формула основной части. Без неё формула считается из первого повтора.
- `zone`: принудительная ключевая зона для цветного квадрата.
- `notes.nikita` / `notes.vanya`: личные заметки.

**templates.yaml**: `templates.<id>`:
- `title`, `draft` (черновик), `days.mon…sun`.
- День — это `rest` или `{ together: [...], nikita: [...], vanya: [...] }`.
- Ссылка на тренировку — id из `workouts.yaml`. С суффиксом `@am` это утро, с `@pm` вечер, без суффикса — когда удобно.

**calendar.yaml**
- `phases[]`: `id`, `title`, `start`, `end`, `focus`.
- `weeks[]`: `start` (понедельник), `template`, `kind: deload` (необязательно).
- `events[]`: `id`, `title`, `kind: trip | race | medical`, `start`, `end`, `athletes` (необязательно), `note`, `day` (необязательно: `rest` или объект дня).
- `overrides[]`: `date`, `athletes` (необязательно), `day` (обязательно), `note` (только для людей).
- `milestones[]`: `date`, `title`, `athletes` (необязательно), `tentative`, `note`. Вехи ничего не меняют в расписании.

`athletes: [nikita]` означает «только для этого атлета». Если поля нет, запись касается всех.

## Инварианты (их проверяет `npm run validate`)

1. Каждый файл проходит свою JSON Schema: нет лишних полей, верные типы, допустимые значения, правильный формат дат и ссылок.
2. Каждая ссылка `id`, `id@am` или `id@pm` указывает на существующую тренировку в `workouts.yaml`.
3. В каждом шаблоне заданы все 7 дней. Ровно один из них `rest`, и это `restDay` из `settings.yaml`.
4. `weeks` начинаются с понедельника и идут подряд, без пропусков и повторов. Шаблон каждой недели существует.
5. Фазы идут по порядку и не пересекаются. Понедельник каждой недели попадает в какую-то фазу.
6. Все даты реальные. У фаз и событий `start ≤ end`.
7. id событий уникальны. События одного атлета не пересекаются по датам.
8. Событие `kind: race` начинается в `race.date`. `race.date` лежит внутри календаря `weeks`.
9. Дата каждого override лежит внутри календаря. На одну дату и одного атлета — не больше одного override.
10. Слоты дня: `together` и id атлетов из `settings.yaml`. Если запись ограничена через `athletes`, слот `together` запрещён, а слоты других атлетов не работают и считаются ошибкой.
11. В объекте дня у каждого затронутого атлета есть хотя бы одна тренировка. Если тренировок нет, пиши `rest`.
12. В `athletes: [...]` и в `notes` используются только известные атлеты.

Неиспользуемые тренировки и шаблоны выводятся как предупреждения. Сборку они не ломают.

## Как `getDay(date, athlete)` собирает день

1. Для атлета ищутся три записи:
   - **override** на эту дату;
   - **событие**, в период которого попадает дата;
   - **шаблон недели**, к которой относится дата.

   Записи с `athletes`, где этого атлета нет, пропускаются. Для другого атлета такое событие даёт `day.event = null`.
2. Выбирается первая подходящая запись: **override › `event.day` › шаблон**.
   - День из override **целиком** заменяет день атлета.
   - Событие без `day` расписание не меняет, но даёт карточку события.
   - Если даты нет в `weeks`, день возвращается с `outside: true`.
3. **Отдых.** Если день — `rest`, возвращается `{ date, week, phase, template, event, override, rest: true, items: [] }`. Для операции это выглядит так: `event.kind === 'medical'`, и UI показывает карточку восстановления.
4. **Тренировки.** День собирается из `together`, затем добавляется слот атлета. Порядок такой: утро (`@am`), потом без времени, потом вечер (`@pm`). Внутри одной группы общие тренировки идут раньше личных.
5. **Разгрузка.** В неделе с `kind: deload` минуты умножаются на 0.7 и округляются до 5 (минимум 5 мин). Это относится к дням по шаблону и к override. Дни, на которые у атлета есть событие, не масштабируются.
6. Override не создаёт карточку в UI. Если на эту дату у атлета есть событие, его карточка останется.

## Рецепты

### Добавить новую тренировку
```yaml
# workouts.yaml → внутри workouts:
  run_hills:
    sport: run
    title: Бег — холмы
    warmup: 15 мин Z1–Z2.
    main: 8 × 60 с в горку (Z4), вниз трусцой.
    cooldown: 10 мин Z1.
    segments: [[15, z2], { x: 8, set: [[1, z4], [1.5, z1]] }, [10, z1]]
    why: Сила толчка и экономичность без ударной нагрузки скоростной работы.
    ref: Barnes 2013
    notes:
      nikita: На подъёме держи пульс, а не темп.
```
После этого сошлись на неё из шаблона или календаря. Пока ссылок нет, validate выводит предупреждение.

### Изменить один день одному атлету
```yaml
# calendar.yaml → overrides:
overrides:
  - date: "2026-12-03"
    athletes: [vanya]
    day: rest                       # или { vanya: [bike_z2@am] }
    note: Перенос из-за работы
```
Чтобы заменить день обоим, убери `athletes` и задай `day: { together: [...], nikita: [...], vanya: [...] }`.

### Несколько дней без тренировок у одного атлета (болезнь, операция)
```yaml
# calendar.yaml → events:
  - id: surgery
    title: Операция
    kind: medical
    athletes: [nikita]
    start: "2026-11-22"
    end: "2026-11-25"
    note: Восстановление после операции.
    day: rest
```

### Поменять тренировку в шаблоне
```yaml
# templates.yaml → templates.base1.days
      wed: { together: [bike_threshold] }        # было: [bike_vo2]
```
Изменение затронет все недели с этим шаблоном. Если нужно поменять тренировку только в одной неделе, используй override на конкретные даты.

### Добавить выездную неделю
```yaml
# calendar.yaml → events:
  - id: ski-feb
    title: Горнолыжка
    kind: trip
    start: "2027-02-13"
    end: "2027-02-20"
    note: Катаемся, плюс короткая поддержка тела.
    day:
      together: [snowboard]
      nikita: [mobility_short]
```
Если не задавать `day`, дни останутся по шаблону, но с карточкой поездки. Поездка не должна пересекаться по датам с другими событиями того же атлета.

### Отметить разгрузочную неделю
```yaml
# calendar.yaml → weeks:
  - { start: "2027-02-08", template: base2, kind: deload }
```

### Добавить веху
```yaml
# calendar.yaml → milestones:
  - date: "2027-04-12"
    title: Контрольный старт 10 км
    athletes: [vanya]            # без поля — веха для обоих
    tentative: true
```

### Перенести дату гонки
Даты меняются в трёх местах одновременно:
1. `settings.yaml`: `race.date: "2027-08-01"`.
2. `calendar.yaml`: у события `id: race` поставь `start` и `end` равными `"2027-08-01"`.
3. `calendar.yaml`: продли `weeks` до недели гонки, а `end` последней фазы (`taper`) поставь на дату гонки. При необходимости сдвинь фазы. Рецепт — в разделе «Продлить календарь».

### Новый шаблон для фазы
```yaml
# templates.yaml → templates:
  base3:
    title: База III
    days:
      mon: rest                    # ровно один rest, и это restDay
      tue: { together: [run_easy_strides@am], nikita: [strength_full_a@pm], vanya: [strength_min_a@pm] }
      wed: { together: [bike_vo2] }
      thu: { together: [swim_technique@am], nikita: [plyo_a@pm, strength_full_b@pm], vanya: [strength_min_b@pm] }
      fri: { together: [swim_aerobic@am, run_z2@pm] }
      sat: { together: [run_long_z2] }
      sun: { together: [bike_long_z2] }
```
Затем подключи шаблон к неделям в `calendar.yaml`: `- { start: "2027-02-01", template: base3 }`. `draft: true` помечает шаблон как черновик.

### Продлить календарь
```yaml
# calendar.yaml → weeks: (каждая следующая — ровно +7 дней, понедельник)
  - { start: "2027-07-19", template: taper }
  - { start: "2027-07-26", template: taper }
```
Новые недели должны попадать в фазу. Продли `end` последней фазы или добавь новую фазу в `phases`.

### Новый атлет (бывает редко)
Добавь атлета в `settings.yaml → athletes`. Затем добавь его id в схемы:
- `calendar.schema.json`: `athleteList` и `daySlots`;
- `templates.schema.json`: `daySlots`;
- `workouts.schema.json`: `notes`.

## Как проверить
```sh
npm run validate          # схемы + связи между файлами
npm run build             # validate + сборка (то же делает CI при push в main)
```
