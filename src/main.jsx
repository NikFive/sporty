import { render } from 'preact'
import './styles.css'
import './lib/update.js'
import { App } from './app.jsx'

render(<App />, document.getElementById('app'))
