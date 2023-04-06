const { ipcRenderer } = require('electron')
const { h, render } = require('preact')
const { useState, useEffect } = require('preact/hooks')
const htm = require('htm')
const JSConfetti = require('js-confetti')
const remote = require('@electron/remote')
const Utils = remote.require('./utils/utils')
const HtmlTranslate = require('./utils/htmlTranslate')
const Store = require('electron-store')
const settings = new Store()
const log = require('electron-log')
const path = require('path')
let username

log.transports.file.resolvePath = () =>
  path.join(remote.app.getPath('userData'), 'logs/main.log')

let jsConfetti

function handlePoke (buddy) {
  if (buddy === username) return
  ipcRenderer.send('pokeBuddy', buddy)
}

function celebratePokes (pokeCount) {
  const confettiConfig = {
    emojis: ['👈🏻', '👈🏽', '👈🏿'],
    confettiNumber: 1,
    emojiSize: 40
  }

  if (pokeCount % 10 === 0) {
    confettiConfig.emojis.push('🤯', '🔥')
    confettiConfig.confettiNumber = pokeCount * 2
  }

  jsConfetti.addConfetti(confettiConfig)
}

function createBuddyObject (buddies) {
  return buddies.reduce((buddyObj, buddy) => {
    buddyObj[buddy] = {
      pokes: 0,
      poked: 0
    }

    return buddyObj
  }, {})
}

// Initialize htm with Preact
const html = htm.bind(h)

function initApp (buddies) {
  function BuddyList ({ buddies }) {
    const [buddyObj, setBuddyObj] = useState({})

    window.pokeBuddy = (pokee, poker) => {
      const pokeCount = buddyObj[pokee].pokes
      let pokedCount = buddyObj[pokee].poked
      setBuddyObj({
        ...buddyObj,
        [pokee]: {
          ...[buddyObj][pokee],
          pokes: pokeCount + 1,
          poked: poker === username ? pokedCount + 1 : pokedCount
        }
      })

      pokedCount = buddyObj[pokee].poked + 1
      if ([pokee, poker].includes(username)) {
        celebratePokes(pokedCount)
      }
    }

    // buddies is a list of strings, we need to transform it to be more extensible.
    useEffect(() => {
      setBuddyObj(createBuddyObject(buddies))
    }, [])

    if (buddies.length === 1) {
      return html`<br />None 😥`
    }

    return html`<ul id="buddy-list">
      ${Object.entries(buddyObj).map(
        ([buddy, buddyInfo]) => html`
          <li
            onClick=${() => handlePoke(buddy)}
            key=${buddy}
            className="buddy-row"
          >
            <div className="buddy-text">
              ${buddy}
              ${buddyInfo.pokes > 0 &&
              html`${' '} <span>(${buddyInfo.pokes})</span>`}
            </div>
            ${username !== buddy && html`<div className="poke">👈</div>`}
          </li>
        `
      )}
    </ul>`
  }

  render(
    html`<div>
      Buddies breaking with you:

      <${BuddyList}
        ref="${(BuddyList) => (window.BuddyList = BuddyList)}}"
        buddies="${buddies}"
      />
    </div>`,
    document.getElementById('app')
  )
}

window.onload = (e) => {
  ipcRenderer.send('send-microbreak-data')

  jsConfetti = new JSConfetti()

  require('./platform')
  new HtmlTranslate(document).translate()

  document.ondragover = (event) => event.preventDefault()

  document.ondrop = (event) => event.preventDefault()

  document.querySelector('#close').onclick = (event) =>
    ipcRenderer.send('finish-microbreak', false)

  document.querySelector('#postpone').onclick = (event) =>
    ipcRenderer.send('postpone-microbreak')

  ipcRenderer.once('breakBuddies', (_event, buddies) => {
    initApp([...buddies])
  })

  ipcRenderer.once('enableStretchlyTeam', (_event, message) => {
    if (message) {
      // show "suggest break idea" button
      const el = document.querySelector('#suggest-idea')
      el.href =
        'mailto:nobody@example.com?subject=Stretchly%20Team%20Break%20Idea'
      el.innerHTML = '<span>Suggest Break Idea</span>'
    }
  })

  ipcRenderer.once('microbreakIdea', (_event, message) => {
    const microbreakIdea = document.querySelector('.microbreak-idea')
    microbreakIdea.innerHTML = message
  })

  ipcRenderer.once('setUsername', (_event, message) => {
    username = message
  })

  ipcRenderer.once('microbreakAdvice', (_event, message) => {
    const el = document.querySelector('.microbreak-advice')
    el.innerHTML = message
  })

  ipcRenderer.on('poke', (_event, message) => {
    window.pokeBuddy(message.pokee, message.poker)
  })

  ipcRenderer.once(
    'progress',
    (
      event,
      started,
      duration,
      strictMode,
      postpone,
      postponePercent,
      backgroundColor
    ) => {
      ipcRenderer.send('mini-break-loaded')
      const progress = document.querySelector('#progress')
      const progressTime = document.querySelector('#progress-time')
      const postponeElement = document.querySelector('#postpone')
      const closeElement = document.querySelector('#close')
      const mainColor = settings.get('mainColor')
      document.body.classList.add(mainColor.substring(1))
      document.body.style.backgroundColor = backgroundColor

      document.querySelectorAll('.tiptext').forEach((tt) => {
        const keyboardShortcut = settings.get('endBreakShortcut')
        tt.innerHTML = Utils.formatKeyboardShortcut(keyboardShortcut)
      })

      window.setInterval(() => {
        if (settings.get('currentTimeInBreaks')) {
          document.querySelector('.breaks > :last-child').innerHTML =
            new Date().toLocaleTimeString()
        }
        if (Date.now() - started < duration) {
          const passedPercent = ((Date.now() - started) / duration) * 100
          postponeElement.style.display = Utils.canPostpone(
            postpone,
            passedPercent,
            postponePercent
          )
            ? 'flex'
            : 'none'
          closeElement.style.display = Utils.canSkip(
            strictMode,
            postpone,
            passedPercent,
            postponePercent
          )
            ? 'flex'
            : 'none'
          progress.value = ((100 - passedPercent) * progress.max) / 100
          progressTime.innerHTML = Utils.formatTimeRemaining(
            Math.trunc(duration - Date.now() + started)
          )
        }
      }, 100)
    }
  )
}
