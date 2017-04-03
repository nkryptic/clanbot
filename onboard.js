/*
=== ON JOIN ===
- add unknown role
- enter them into db
- send welcome message with instructions


=== ON MESSAGE ====

IF UNKNOWN
  /register
  - check syntax and give feedback if incorrect
  - lookup clash acct
  - if no match, let them know
  - if match isn't in clan family, let them know
  - WHAT if they're already doing this process and have an entry already?



  /apply



  /visit



  /restart
*/
const splitMessage = require('discord.js').splitMessage
const Storage = require('node-storage')
// const hash = require('string-hash')
const Logger = require('./logger.js')

const appName = 'OnBoard'
const logger = new Logger(appName)

const noop = () => {}
const API_PLAYER_URL = 'https://api.clashofclans.com/v1/players/%23{TAG}'
const API_CLAN_MEMBERS_URL = 'https://api.clashofclans.com/v1/clans/%23{TAG}/members'
const clanFamilyTags = ['#9V00QQ9G', '#88JQ8VPQ', '#YL0YV9Q']
const clanRoleMap = {leader: 'a leader', coLeader: 'a co-leader', admin: 'an elder', member: 'a member'}

// const register_member_regex = new RegExp(/^!register +member +#?([a-zA-Z0-9]+) *$/, 'i')
// const register_prospect_regex = new RegExp(/^!register +guest +#?([a-zA-Z0-9]+) *$/, 'i')
const cmd_prefix = '/'
// const base_cmd_regex = new RegExp(/^/.source + cmd_prefix + /\b/.source, 'i')
// const usage_cmd_regex = new RegExp(base_cmd_regex.source + / *$/.source, 'i')
// const list_owners_cmd_regex = new RegExp(base_cmd_regex.source + / +owners *$/.source, 'i')
// const basicUsage = '*The ' + appName + ' commands:*' + '\n'
//   + '**`' + cmd_prefix + ' status` ** - show clan reminder status' + '\n'
//   + '**`' + cmd_prefix + ' owners` ** - list Discord users with registered CoC accounts (in any clan)' + '\n'
//   + '**`' + cmd_prefix + ' roster` ** - list clan accounts with their registered owner (or ' + acctHashLabel + ')' + '\n'
//   + '**`' + cmd_prefix + ' identify <clashID or ' + acctHashLabel + '>` ** - register a clan account to yourself'
// const authUsage = basicUsage + '\n\nAdmin-only commands:\n'
//   + '**`' + cmd_prefix + ' add <clashID or ' + acctHashLabel + '> to <Discord username>` ** - register a clan account for a Discord user' + '\n'
//   + '**`' + cmd_prefix + ' remove <clashID or ' + acctHashLabel + '>` ** - unregister a clan account' + '\n'
//   + '**`' + cmd_prefix + ' cleanup` ** - remove Discord users and registered accounts that have left the server' + '\n'
//   + '**`' + cmd_prefix + ' notify march` ** - ping marching orders to owners of clan accounts in war'


function OnBoard(config, client) {
  this.client = client
  this.options = JSON.parse(JSON.stringify(config.onboard))
  thos.options.apiToken = config.apiToken
  // this.db = new Storage(this.options.db)
  this.db = new Storage('./onboard.db')
  this.accounts = {
      clash: new Map(this.db.get('accounts.clash') || [])
    , discord: new Map(this.db.get('accounts.discord') || [])
  }
  this.roles = {}
  this.channels = {}
  this.guild = null
  this.online = false

  if (this.options.enabled)  {
    this.client.on('guildMemberAdd', this.onGuildMemberAdd.bind(this))
    this.client.on('guildMemberRemove', this.onGuildMemberRemove.bind(this))
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

OnBoard.prototype.onGuildMemberAdd = function(member) {
  if (member.user.bot) {return}

  this.channels.welcome.startTyping()
  // on join, send unknown users the registration instructions:
  member.addRole(this.roles.unknown).catch(noop)
  this.accounts.discord.set(member.id, {
      status: 'unknown'
    , type: 'unknown'
    , primaryVillage: null
    , villages: []
  })
  let message = 'Hi, I\'m an automated chatbot to help you get started\n'
              + 'Welcome ' + member + '!\n\n'
              + 'Are you visiting or are you in one of our clans?\n'
              + '- type `!register member #CLASHTAG` - if you are already a member in one of our clans\n'
              + '- type `!register guest #CLASHTAG` if you are looking to join our family or just visit\n'
              // + '- type `!register guest` - for temporary access (your membership will only last a few hours)\n'
              + '*replace #CLASHTAG with your CoC tag viewable at the top of your Clash profile page*'
  setTimeout(() => {data.chan.stopTyping(); data.chan.sendMessage(message).catch(noop)}, 4000)
}

OnBoard.prototype.onGuildMemberRemove = function(member) {
  console.log('guildMemberRemove')
}

OnBoard.prototype.onMessage = function(msg) {
  if (msg.author.bot) {
    return
  }
  // register
  // apply
  // visit
  if (msg.member.roles.has(this.roles.unknown.id)) {
    if (/^\/register/i.test(msg.content)) {
      match = /^\/register +#?([a-zA-Z0-9]+) *$/i.exec(msg.content)
      if (match) {
        getPlayerJSON(this.options.apiToken, match[1])
          .then(function(info) {
            if (info.clan && info.clan.tag && clanFamilyTags.includes(info.clan.tag)) {
              // if account isn't already claimed...
              data.accounts.discord.set(msg.member.id, {
                  status: 'onboarding'
                , type: 'member'
                , step: 1
                , primaryVillage: info.tag
                , villages: [info.tag]
              })
              msg.member.setNickname(info.name).catch(console.log)

              setTimeout(() => {msg.channel.sendMessage('I see you are a member of ' + info.clan.name + '.  Welcome to the family!')}, 500)
              setTimeout(() => {msg.channel.sendMessage('Just have a few things for you to read before I can give you full access here...')}, 1000)
              setTimeout(() => {msg.channel.sendMessage(rulesMsg)}, 2500)
              setTimeout(() => {msg.channel.sendMessage('\n\nType `!continue ` when you\'ve read that and want to proceed.')}, 5000)

              // else
              // msg.channel.sendMessage('That village is already claimed here' + info.clan.name + '.  Welcome to the family!')
            }
            else if (info.clan && info.clan.tag) {
              msg.channel.sendMessage('sorry, that village belongs to the ' + info.clan.name + ' clan, which is not part of our family.  maybe register as a guest?')
            }
            else {
              msg.channel.sendMessage('sorry, your village is not a member of a clan in our family.  maybe register as a guest?')
            }
          }.bind(this))
          .catch(e => {
            console.log(e)
            msg.channel.sendMessage('sorry, that does not appear to be a valid clash account tag')
          })
      }
    }
    else if (register_prospect_regex.test(msg.content)) {
      match = register_prospect_regex.exec(msg.content)
      if (match) {
        getPlayerJSON(match[1])
          .then(info => {
            if (info.clan && info.clan.tag && clanFamilyTags.includes(info.clan.tag)) {
              msg.channel.sendMessage('sorry, your village is a member of a clan in our family.  maybe register as a member?')
            }
            else {
              let nick = info.name
              if (info.clan && info.clan.name) {
                nick = nick + ' (' + info.clan.name + ')'
              }
              data.accounts.discord.set(msg.member.id, {
                  status: 'onboarding'
                , type: 'guest'
                , step: 1
                , primaryVillage: info.tag
                , villages: [info.tag]
              })
              msg.member.setNickname(nick).catch(console.log)
              setTimeout(() => {msg.channel.sendMessage('Registering you as a guest.  Your nickname is now ' + nick + '.  Thanks for checking us out!')}, 500)
              setTimeout(() => {msg.channel.sendMessage('Just have a few things for you to read before I can finalize your access...')}, 1000)
              setTimeout(() => {msg.channel.sendMessage(rulesMsg)}, 2500)
              setTimeout(() => {msg.channel.sendMessage('\n\nType `!continue ` when you\'ve read that and want to proceed.')}, 5000)
            }
          })
          .catch(e => {
            console.log(e)
            msg.channel.sendMessage('sorry, that does not appear to be a valid clash account tag')
          })
      }
    }
    // else if (register_guest_regex.test(msg.content)) {
    // }
    else if (msg.content === '!continue') {
      let acct = data.accounts.discord.get(msg.member.id)
      if (acct && acct.status === 'onboarding') {
        if (acct.step == 1) {
          acct.step = 2
          data.accounts.discord.set(msg.member.id, acct)

          msg.channel.sendMessage(familyMsg)
          msg.channel.sendMessage('Type `!continue ` when you\'ve read that and want to proceed.')
        }
        else if (acct.step == 2) {
          delete acct.step
          acct.status = 'registered'
          data.accounts.discord.set(msg.member.id, acct)
          msg.member.removeRole(data.roles.unknown)
          msg.channel.sendMessage('You are now fully registered')
          if (acct.type === 'guest') {
            msg.member.addRole(data.roles.guest)
            msg.channel.sendMessage('*Note you have very limited access and many channels are read-only*')
            getPlayerJSON(acct.primaryVillage)
              .then(info => {
                let output = 'A guest just registered: ' + info.name + '.  A TH' + info.townHallLevel
                           + ' with ' + info.trophies + ' trophies, ' + info.warStars + ' war stars, '
                           + info.attackWins + ' attacks and ' + info.defenseWins + ' defends this season.'

                if (info.clan && info.clan.name) {
                  output = output + ' Currently ' + clanRoleMap[info.role] + ' in the clan "' + info.clan.name + '".'
                }
                output = output + ' Discord username: ' + msg.member.user.username
                data.chan2.sendMessage(output)
              })
              .catch(e => {
                console.log(e)
              })
          }
          else {
            msg.member.addRole(data.roles.member)
            data.chan2.sendMessage('A clam member just registered: ' + msg.member.nickname + ' -- Discord username: ' + msg.member.user.username)
          }
        }
      }
    }
    else {
      let acct = data.accounts.discord.get(msg.member.id)
      if (acct && acct.status === 'onboarding') {
        msg.channel.sendMessage('Type `!continue ` when you\'ve read everything and want to proceed.')
      }
      else {
        let message = '\n**You won\'t be able to do anything until you register**\n\n'
                    + 'Are you visiting or are you in one of our clans?\n'
                    + '- type `!register member #CLASHTAG` - if you are already a member in one of our clans\n'
                    + '- type `!register guest #CLASHTAG` if you are looking to join our family or just visit\n'
                    // + '- type `!register guest` - for temporary access (your membership will only last a few hours)\n'
                    + '*replace #CLASHTAG with your CoC tag viewable at the top of your Clash profile page*'
        msg.channel.sendMessage(message)
      }
    }
  }
}

OnBoard.prototype.onReady = function() {
  if (!this.online) {
    logger.log('online!')
    this.online = true
    this.guild = this.client.guilds.find('name', 'Playmakers Wanted')
    this.channels.welcome = this.guild.channels.find('name', 'register')
    this.channels.general = this.guild.channels.find('name', 'primary-chat')
    this.roles.guest = this.guild.roles.find('name', 'Guests')
    this.roles.member = this.guild.roles.find('name', 'Members')
    this.roles.unknown = this.guild.roles.find('name', 'Unknowns')
  }
}


function getPlayerJSON(apiToken, tag) {
  tag = tag.replace('#', '')
  return new Promise((resolve, reject) => {
    var p = Request({
        url: API_PLAYER_URL.replace('{TAG}', tag)
      , json: true
      , auth: {
          bearer: apiToken
        }
      }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
          resolve(body)
        }
        else {
          if (!error) {
            reject(body)
          }
          reject(error)
        }
      })
  })
}


module.exports = OnBoard