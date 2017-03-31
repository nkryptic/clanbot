/*
TODO:
*/
const splitMessage = require('discord.js').splitMessage
const Storage = require('node-storage')
// const hash = require('string-hash')
const Logger = require('./logger.js')

const appName = 'OnBoard'
const logger = new Logger(appName)

const base_cmd_text = '/'
// const base_cmd_regex = new RegExp(/^/.source + base_cmd_text + /\b/.source, 'i')
// const usage_cmd_regex = new RegExp(base_cmd_regex.source + / *$/.source, 'i')
// const list_owners_cmd_regex = new RegExp(base_cmd_regex.source + / +owners *$/.source, 'i')


function OnBoard(config, client) {
  this.client = client
  this.options = JSON.parse(JSON.stringify(config.onboard))
  this.db = new Storage(this.options.db)
  this.accounts = {
      clash: new Map(this.db.get('accounts.clash') || [])
    , discord: new Map(this.db.get('accounts.discord') || [])
  }
  this.guild = null
  this.online = false

  if (this.options.enabled)  {
    this.client.on('message', this.onMessage.bind(this))
    this.client.on('ready', this.onReady.bind(this))
  }
}

OnBoard.prototype._formatMemberMsg = function(member, text, testing) {
  let output

  if (testing) {
    if (member.nickname) {
      output = '@' + member.nickname
    }
    else {
      output = '@' + member.user.username
    }
  }
  else {
    output = '' + member
  }
  output = output + ' ' + text
  return output
}

OnBoard.prototype._sendMessage = function(channel, output) {
  let messages = splitMessage(output)
  if (messages instanceof Array) {
    for (let partial of messages) {
      channel.sendMessage(partial)
        .catch(e => {})
    }
  }
  else {
    channel.sendMessage(messages)
      .catch(e => {})
  }
}

OnBoard.prototype._getMember = function(needle, searchByName) {
  let target = null

  if (needle) {
    if (searchByName) {
      target = this.guild.members.find((member) => {
        if (member.user.username.toLowerCase() === needle.toLowerCase()
            || (member.nickname && member.nickname.toLowerCase() === needle.toLowerCase())
        ) {
          return true
        }
        return false
      })
    }
    else {
      target = this.guild.members.find( member => member.user.id === needle )
    }
  }
  return target
}

OnBoard.prototype._addAccount = function(clashid, member) {
  for (let [k, v] of this.accounts.discord.entries()) {
    if (k != member.id && v.indexOf(clashid) > -1) {
      v.splice(v.indexOf(clashid), 1)
      if (v.length > 0) {
        this.accounts.discord.set(k, v)
      }
      else {
        this.accounts.discord.delete(k)
      }
    }
  }
  let owned = this.accounts.discord.get(member.id) || []
  if (owned.indexOf(clashid) === -1) {
    owned.push(clashid)
  }
  this.accounts.discord.set(member.id, owned)
  this.accounts.clash.set(clashid, member.id)

  this.db.put('accounts.discord', Array.from(this.accounts.discord.entries()))
  this.db.put('accounts.clash', Array.from(this.accounts.clash.entries()))
}

OnBoard.prototype._removeAccount = function(clashid) {
  for (let [k, v] of this.accounts.discord.entries()) {
    if (v.indexOf(clashid) > -1) {
      v.splice(v.indexOf(clashid), 1)
      if (v.length > 0) {
        this.accounts.discord.set(k, v)
      }
      else {
        this.accounts.discord.delete(k)
      }
    }
  }
  
  this.accounts.clash.delete(clashid)

  this.db.put('accounts.discord', Array.from(this.accounts.discord.entries()))
  this.db.put('accounts.clash', Array.from(this.accounts.clash.entries()))
}

OnBoard.prototype.onMessage = function(msg) {
  // test
}

OnBoard.prototype.onReady = function() {
  if (!this.online) {
    logger.log('online!')
    this.online = true
    this.guild = this.client.guilds.find('name', this.options.guild)
  }
}


module.exports = OnBoard
