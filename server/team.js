'use strict'
const Scheduler = require('./utils/scheduler.js')
const Shuffled = require('./utils/shuffled.js')
const enLocale = require('./locales/en.json')

module.exports = class Team {
  constructor (name, password) {
    this.name = name
    this.password = password
    this.clients = []

    this.minibreakIdeasKeys = new Shuffled(Object.keys(enLocale.miniBreakIdeas))
    this.adviceKeys = new Shuffled(Object.keys(enLocale.longBreakIdeas))

    this.interval = 20 * 60 * 1000
    this.duration = 20 * 1000
    this.scheduler = new Scheduler(() => this.serveMinibreak(), this.interval, 'minibreak')
    this.scheduler.plan()
  }

  get breakBuddies () {
    return this.clients.map((c) => c.username)
  }

  get timeUntilNextBreak () {
    return this.scheduler.timeLeft
  }

  addClient (socket, username) {
    this.clients.push({
      socket,
      username
    })
  }

  removeClient (socket) {
    this.clients = this.clients.filter(c => c.socket !== socket)
  }

  // TODO: hash if storing in db
  checkPassword (password) {
    return this.password === password
  }

  updateIntervalAndDuration (newInterval, newDuration) {
    console.log(`Updating interval to ${newInterval} ms and duration to ${newDuration} ms for team ${this.name}`)
    this.interval = newInterval
    this.duration = newDuration
    this.scheduler.delay = this.interval
    this.scheduler.correct()
  }

  /**
   * Connection tests are sent to clients so that
   * dead connections can be removed from the client list
   * to ensure that the breakBuddies list is correct.
  */
  sendConnectionTest () {
    if (this.clients.length === 0) {
      return
    }
    console.log(`sending keep alive to team ${this.name}`)
    for (const client of this.clients) {
      client.socket.send(JSON.stringify({
        eventType: 'connectionTestPing'
      }))
    }
  }

  serveMinibreak () {
    this.scheduler.plan()
    this.sendConnectionTest()
    if (this.clients.length === 0) {
      console.log(`no one connected to team ${this.name}:(`)
      return
    }
    console.log(`serving mini break to team ${this.name}`)
    const newIdeaKey = this.minibreakIdeasKeys.randomElement
    const newAdviceKey = this.adviceKeys.randomElement
    for (const client of this.clients) {
      client.socket.send(JSON.stringify({
        eventType: 'minibreak',
        ideaKey: newIdeaKey,
        ideaText: enLocale.miniBreakIdeas[newIdeaKey].text, // if user is missing this key
        adviceKey: newAdviceKey,
        adviceText: enLocale.longBreakIdeas[newAdviceKey].text, // if user is missing this key
        duration: this.duration,
        breakBuddies: this.breakBuddies
      }))
    }
  }

  sendPokeToClients (poker, pokee) {
    const payload = {
      eventType: 'poke',
      poker,
      pokee
    }

    try {
      this.clients.forEach((client) => client.socket.send(JSON.stringify(payload)))
    } catch (e) {
      console.log('failed to poke buddies :(')
    }
  }
}
