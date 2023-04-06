const express = require('express')
const ws = require('ws')
const fs = require('fs')
const Mustache = require('mustache')
const bodyParser = require('body-parser')
const Team = require('./team.js')

function mustache (templatePath, context) {
  const template = fs.readFileSync(templatePath)
  return Mustache.render(template.toString(), context)
}

const teams = {}

const app = express()
app.use(bodyParser.urlencoded({ extended: true }))

// application settings
app.get('/', (req, res) => {
  res.send(mustache('views/index.html', { teams: Object.values(teams) }))
})

app.get('/team/:teamName', (req, res) => {
  const teamName = req.params.teamName
  if (!(teamName in teams)) {
    return res.status(404).send('Not found')
  }

  const password = req.query.password
  const team = teams[teamName]
  if (!team.checkPassword(password)) {
    return res.send(mustache('views/password.html', { teamName, invalidPassword: password !== undefined }))
  }

  res.send(mustache('views/team.html', team))
})

app.post('/team/:teamName', (req, res) => {
  const teamName = req.params.teamName
  if (!(teamName in teams)) {
    return res.status(404).send('Not found')
  }
  const team = teams[teamName]

  const newInterval = parseInt(req.body.interval, 10)
  const newDuration = parseInt(req.body.duration, 10)
  if (!newInterval || !newDuration) {
    return res.status(400).send('invalid interval or duration')
  }
  team.updateIntervalAndDuration(newInterval, newDuration)

  res.redirect(`/team/${teamName}`)
})

const server = app.listen(3000)

const wsServer = new ws.Server({ noServer: true })
wsServer.on('connection', (socket, req) => {
  const team = teams[req.headers['stretchly-team']]
  socket.on('message', _message => {
    const message = JSON.parse(_message)
    console.log(message)
    switch (message.eventType) {
      case 'clientReady': {
        team.addClient(socket, message.username)
        socket.send(JSON.stringify({ eventType: 'serverReady' }))
        break
      }
      case 'poke': {
        const poker = team.clients.find(
          (client) => client.socket === socket
        ).username
        const pokee = message.pokedBuddy
        team.sendPokeToClients(poker, pokee)
        break
      }
    }
  })
  socket.on('close', () => {
    console.log('closing socket')
    team.removeClient(socket)
  })
})
// `server` is a vanilla Node.js HTTP server, so use
// the same ws upgrade process described here:
// https://www.npmjs.com/package/ws#multiple-servers-sharing-a-single-https-server
server.on('upgrade', (req, socket, head) => {
  if (!('stretchly-team' in req.headers) || !('stretchly-team-password' in req.headers)) {
    console.log('Unauthorized: missing team name or password')
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }
  const team = getOrCreateTeam(req.headers['stretchly-team'], req.headers['stretchly-team-password'])
  if (team === null) {
    console.log('Unauthorized: incorrect password')
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }
  wsServer.handleUpgrade(req, socket, head, socket => {
    wsServer.emit('connection', socket, req)
  })
})

function getOrCreateTeam (teamName, password) {
  if (!(teamName in teams)) {
    teams[teamName] = new Team(teamName, password)
    return teams[teamName]
  }
  if (!teams[teamName].checkPassword(password)) {
    return null
  }

  return teams[teamName]
}
