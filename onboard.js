/*

TODO:
scheduled jobs
- update known clash accounts
-- new acct => promote discord user to member?
-- acct left => demote discord user to guest?
-- clan roles???
- attack/defend logging
- important moments of war logging
- war timing pings (by TH level?)


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
const clanFamily = {
    'FNF': {tag: '#9V00QQ9G', role: 'FNF'}
  , 'GNG': {tag: '#88JQ8VPQ', role: 'GNG'}
  , 'HNH': {tag: '#YL0YV9Q', role: 'HNH'}
  , 'VNV': {tag: '#C2VPYLJU', role: 'VNV'}
  , 'RNR': {tag: '#QVPJRV0G', role: 'RNR'}
}
const clanFamilyTags = Object.entries(clanFamily).map(([k, v]) => {return v.tag})
const clanFamilyRoles = new Map(Object.entries(clanFamily).map(([k, v]) => {return [v.tag, v.role]}))
const clanRoleMap = {leader: 'leader', coLeader: 'co-leader', admin: 'elder', member: 'member'}
const humanizedClanRoleMap = {leader: 'a leader', coLeader: 'a co-leader', admin: 'an elder', member: 'a member'}

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
const signupBaseMsg = 'Are you visiting, looking to join or are you already in one of our clans?\n'
  + '- type `' + cmd_prefix + 'register #CLASHTAG` - if you are already a member in one of our clans\n'
  + '- type `' + cmd_prefix + 'apply #CLASHTAG` if you are looking to join a clan in our family\n'
  + '- type `' + cmd_prefix + 'visit #CLASHTAG` for guest access\n'
  + '*replace #CLASHTAG with your CoC tag viewable at the top of your Clash profile page*'
const conflictBaseMsg = 'Because the village you have tried to register is already claimed by someone, you can:\n'
  + '- type `' + cmd_prefix + 'get-support` - to contact a support person who may be able to release the village\n'
  + '- type `' + cmd_prefix + 'restart` - if you want to start regstration over from the beginning for a differnt village')

var playerDataCache = new Map([])


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
  this.onboardMsgs = this.db.get('onboard.messages') || []
  this.joinMsgs = this.db.get('join.messages') || []
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

OnBoard.prototype._updateDiscordAccount = function(discordid, info) {
  this.accounts.discord.set(discordid, info)
  this.db.put('accounts.discord', Array.from(this.accounts.discord.entries()))
}

OnBoard.prototype._updateClashAccount = function(clashid, discordid, info) {
  // {
  //   "tag": "#20LJPQQYG",
  //   "name": "nkryptic",
  //   "townHallLevel": 9,
  //   "clan": {
  //     "tag": "#88JQ8VPQ",
  //     "name": "Grit N Grind"
  //   }
  // }
  let newInfo = {}
  this.accounts.clash.set(clashid, [discordid, newInfo])
  this.db.put('accounts.clash', Array.from(this.accounts.clash.entries()))
}

OnBoard.prototype.onGuildMemberAdd = function(member) {
  if (member.user.bot) {return}

  this.channels.welcome.startTyping()
  // on join, send unknown users the registration instructions:
  member.addRole(this.roles.unknown).catch(noop)
  this._updateDiscordAccount(member.id, {
      status: 'unknown'
    , type: 'unknown'
    , primaryVillage: null
    , villages: []
  })
  let message = 'Hi, I\'m an automated chatbot to help you access the server\n'
              + 'Welcome ' + member + '!\n\n' + signupBaseMsg
  setTimeout(() => {
    this.channels.welcome.stopTyping(); this.channels.welcome.chan.sendMessage(message).catch(noop)
  }, 4000)
  // TODO: write "join server" message to "audit" channel
}

OnBoard.prototype.onGuildMemberRemove = function(member) {
  let acct = this.accounts.discord.get(member.id)
  if (acct) {
    for (let clashid of acct.villages) {
      this.accounts.clash.delete(clashid)
    }
    this.accounts.discord.delete(member.id)
  }
  this.db.put('accounts.discord', Array.from(this.accounts.discord.entries()))
  this.db.put('accounts.clash', Array.from(this.accounts.clash.entries()))

  // TODO: write "left server" message to "audit" channel
}

OnBoard.prototype.onMessage = function(msg) {
  const authzRoleName = 'Co-Leaders'  // this.options.authzRole
      // , isAdminUser = m => m.author.username === 'nkryptic' || m.author.username === 'Stacey'
      , isAdminUser = m => authzRoleName && m.roles.exists('name', authzRoleName)
      , isMemberUser = m => m.roles.has(this.roles.member.id) || m.roles.has(this.roles.newMember.id)

  if (msg.author.bot) {
    return
  }

  // IF UNKNOWN
  if (msg.member.roles.has(this.roles.unknown.id)) {
    let acct = this.accounts.discord.get(msg.member.id) || {}
    const register_base_cmd_regex = new RegExp(/^/.source + cmd_prefix + /register\b/.source, 'i')
    const register_cmd_regex = new RegExp(register_base_cmd_regex.source + / +#?([a-zA-Z0-9]+) *$/.source, 'i')
    /*
    /register #CLASHTAG
    - check syntax and give feedback if incorrect
    - lookup clash acct
    - if no match, let them know
    - if match isn't in clan family, let them know
    - if they're already verifying/onboarding
    -- stop... give them a message to /restart first
    - if the tag belongs to an already associated account, let them know
    -- how to mitigate?  maybe tell thim to ping someone?
    - then update db
    -- mark as "uncomfirmed" status
    -- add clash account tag
    - diplay found account info for user and ask them to /confirm
    */
    if (register_base_cmd_regex.test(msg.content) && !(acct && acct.status === 'onboarding')) {
      let match = register_cmd_regex.exec(msg.content)
      if (match) {
        let tag = match[1].toUpperCase().replace(/O/g, '0')
        getPlayerJSON(this.options.apiToken, tag)
          .then(function(info) {
            if (info.clan && info.clan.tag && clanFamilyTags.includes(info.clan.tag)) {
              this._updateDiscordAccount(msg.member.id, {
                  status: 'uncomfirmed'
                , type: 'member'
                , primaryVillage: info.tag
                , villages: [info.tag]
              })

              output = ('Here is what I found matching the clash tag ' + info.tag ':\n'
                + '*Village*: ' + info.name + ' (TH' + info.townHallLevel + ')\n')
                
              if (info.clan) {
                output += '*clan*: ' + info.clan.name + ' (' + clanRoleMap[info.role] + ')\n\n'
              }
              else {
                output += '*clan*: NONE\n\n'
              }
              
              output += ('type `' + cmd_prefix + 'confirm ` if the above is correct or '
                + '`' + cmd_prefix + 'restart ` to try again')
              msg.channel.sendMessage(output)
            }
            else if (info.clan && info.clan.tag) {
              msg.channel.sendMessage('sorry, that village belongs to the ' + info.clan.name
                + ' clan, which is not part of our family.  signup as a guest or apply to '
                + 'join instead.\n\n' + signupBaseMsg)
            }
            else {
              msg.channel.sendMessage('sorry, your village is not a member of a clan in our '
                + 'family.  signup as a guest or apply to join instead.\n\n' + signupBaseMsg)
            }
          }.bind(this))
          .catch(e => {
            logger.error('failed to retrieve player json for ' + tag + ' => ' + e)
            msg.channel.sendMessage('sorry, that does not appear to be a valid clash account '
              + 'tag.\n\n' + signupBaseMsg)
          })
      }
      else {
        // bad command syntax
        msg.channel.sendMessage('sorry, it appears you are not including the clash tag properly\n'
          + '- type `' + cmd_prefix + 'register #CLASHTAG`'
          + '*replace #CLASHTAG with your CoC tag viewable at the top of your Clash profile page*\n\n'
          + 'It should look similar to: `' + cmd_prefix + 'register #9V08QQ9G`')
      }
    }
    
    const reg_other_base_cmd_regex = new RegExp(/^/.source + cmd_prefix + /(apply|visit)\b/.source, 'i')
    const reg_other_cmd_regex = new RegExp(reg_other_base_cmd_regex.source + / +#?([a-zA-Z0-9]+) *$/.source, 'i')
    /*
    /apply #CLASHTAG
    /visit #CLASHTAG
    - check syntax and give feedback if incorrect
    - lookup clash acct
    - if no match, let them know
    - if match is in clan family, let them know
    - if they're already verifying/onboarding
    -- stop... give them a message to /restart first
    - if the tag belongs to an already associated account, let them know
    -- how to mitigate?  maybe tell thim to ping someone?
    - then update db
    -- mark as "uncomfirmed" status
    -- add clash account tag
    - diplay found account info for user and ask them to /confirm
    */
    else if (reg_other_base_cmd_regex.test(msg.content) && !(acct && acct.status === 'onboarding')) {
      let match = reg_other_base_cmd_regex.exec(msg.content)
        , action = match[1]
      
      match = reg_other_cmd_regex.exec(msg.content)
      if (match) {
        let tag = match[2].toUpperCase().replace(/O/g, '0')
        getPlayerJSON(this.options.apiToken, tag)
          .then(function(info) {
            if (!info.clan || (info.clan.tag && !clanFamilyTags.includes(info.clan.tag))) {
              // if account isn't already claimed...
              let acctType = action === 'apply' ? 'prospect' : 'guest'
              this._updateDiscordAccount(msg.member.id, {
                  status: 'uncomfirmed'
                , type: acctType
                , primaryVillage: info.tag
                , villages: [info.tag]
              })

              output = ('Here is what I found matching the clash tag ' + info.tag ':\n'
                + '*Village*: ' + info.name + ' (TH' + info.townHallLevel + ')\n')
                
              if (info.clan) {
                output += '*clan*: ' + info.clan.name + ' (' + clanRoleMap[info.role] + ')\n\n'
              }
              else {
                output += '*clan*: NONE\n\n'
              }
              
              output += ('type `' + cmd_prefix + 'confirm ` if the above is correct or '
                + '`' + cmd_prefix + 'restart ` to try again')
              msg.channel.sendMessage(output)
            }
            else {
              msg.channel.sendMessage('sorry, that village belongs to the ' + info.clan.name
                + ' clan, which is part of our family.  signup as a member instead.\n\n'
                + signupBaseMsg)
            }
          }.bind(this))
          .catch(e => {
            logger.error('failed to retrieve player json for ' + tag + ' => ' + e)
            msg.channel.sendMessage('sorry, that does not appear to be a valid clash account '
              + 'tag.\n\n' + signupBaseMsg)
          })
      }
      else {
        // bad command syntax
        msg.channel.sendMessage('sorry, it appears you are not including the clash tag properly\n'
          + '- type `' + cmd_prefix + action + ' #CLASHTAG`'
          + '*replace #CLASHTAG with your CoC tag viewable at the top of your Clash profile page*\n\n'
          + 'It should look similar to: `' + cmd_prefix + action + ' #9V08QQ9G`')
      }
    }

    const confirm_cmd_regex = new RegExp(/^/.source + cmd_prefix + /confirm\b *$/.source, 'i')
    /*
    /confirm
    - if the user is not "uncomfirmed", let them know
    - then update db
    -- mark as "onboarding" status
    -- mark as step 0
    - acknowledge confirmation and explain upcoming messages, asking them to /next
    */
    else if (confirm_cmd_regex.test(msg.content) && acct && acct.status === 'uncomfirmed') {
      getPlayerJSON(this.options.apiToken, acct.primaryVillage)
        .then(function(info) {
          if (this.accounts.clash.has(info.tag)) {
            // village claimed by someone else already...
            acct.status = 'conflict'
            this._updateDiscordAccount(msg.member.id, acct)
            msg.channel.sendMessage('Sorry, the tag ' + info.tag + 'has already been claimed.\n\n' + conflictBaseMsg)
          }
          else {
            // village isn't already claimed...
            Object.assign(acct, {status: 'onboarding', step: 0})
            this._updateDiscordAccount(msg.member.id, acct)
            
            // assign nickname: IGN (clan-name)
            let nick = info.name
            if (acct.type !== 'member') {
              let clanName = info.clan ? info.clan.name : 'no clan'
                , strLength = nick.length + clanName.length + 3

              if (strLength > 32) {
                clanName = '?'
                strLength = nick.length + 4
                if (strLength > 32) {
                  nick = nick.substr(0, 25) + '...'
                }
              }
              nick += ' (' + clanName + ')'
            }
            msg.member.setNickname(nick).catch(noop)

            msg.channel.sendMessage('Thank you. Just a few items for you to read through '
              + 'before you are granted full access to the rest of the server...\n\n'
              + 'Type `' + cmd_prefix + 'next ` to proceed.')
          }

        }.bind(this))
        .catch(e => {
          logger.error('failed to retrieve player json for ' + acct.primaryVillage + ' => ' + e)
          msg.channel.sendMessage('sorry, there was an issue looking up your clash account.\n'
            + 'try the `' + cmd_prefix + 'confirm` command again in a few moments.')
        })
    }

    const next_cmd_regex = new RegExp(/^/.source + cmd_prefix + /next\b *$/.source, 'i')
    /*
    /next
    - if the user is not "onboarding", let them know
    - if current step > max step
    -- finalize them and send them on their way
    --- set status to registered
    --- remove unknown role
    --- give correct role based on db role
    --- send user appropriate message for their role
    --- write appropriate message in general channel about this user
    --- if applying, write message in #recruiting channel
    - send text info of step # matching from their last "step" + 1
    - then update db
    -- mark as step = step + 1
    - ask them to /next
    */
    else if (next_cmd_regex.text(msg.content) && acct && acct.status === 'onboarding') {
      let step = acct.step || 0
        , output = this.onboardMsgs[step]

      if (step < this.onboardMsgs.length) {
        msg.channel.sendMessage(this.onboardMsgs[step])
        msg.channel.sendMessage('** **\nType `' + cmd_prefix + 'next ` to proceed.')
        acct.step = step + 1
        this._updateDiscordAccount(msg.member.id, acct)
      }
      else {
        delete acct.step
        acct.status = 'registered'
        acct.joinedOn = new Date().toLocaleDateString()
        this._updateDiscordAccount(msg.member.id, acct)
        msg.member.removeRole(this.roles.unknown)

        getPlayerJSON(acct.primaryVillage)
          .then(info => {
            this._updateClashAccount(acct.primaryVillage, msg.member.id, info)
            let output = ''
            if (acct.type === 'guest') {
              msg.member.addRole(this.roles.guest)
              msg.channel.sendMessage(this.joinMsgs['guest'])
              
              output = 'A guest just completed registration: ' + info.name + '.  A TH' + info.townHallLevel
                     + ' with ' + info.trophies + ' trophies, ' + info.warStars + ' war stars, '
                     + info.attackWins + ' attacks and ' + info.defenseWins + ' defends this season.'

              if (info.clan && info.clan.name) {
                output = output + ' Currently ' + humanizedClanRoleMap[info.role] + ' in the clan "' + info.clan.name + '".'
              }
              output = output + ' Discord username: ' + msg.member.user.username
            }
            else if (acct.type === 'prospect') {
              msg.member.addRole(this.roles.prospect)
              msg.channel.sendMessage(this.joinMsgs['prospect'])

              output = 'A prospect just completed registration: ' + info.name + '.  A TH' + info.townHallLevel
                     + ' with ' + info.trophies + ' trophies, ' + info.warStars + ' war stars, '
                     + info.attackWins + ' attacks and ' + info.defenseWins + ' defends this season.'

              if (info.clan && info.clan.name) {
                output = output + ' Currently ' + humanizedClanRoleMap[info.role] + ' in the clan "' + info.clan.name + '".'
              }
              output = output + ' Discord username: ' + msg.member.user.username
            }
            else {
              msg.member.addRole(this.roles.newMember)
              msg.channel.sendMessage(this.joinMsgs['member'])
              
              msg.member.addRole(this.roles.family[clanFamilyRoles.get(info.clan.tag)])

              output = 'A member just completed registration: ' + info.name + '.  A TH' + info.townHallLevel
                     + ' with ' + info.trophies + ' trophies, ' + info.warStars + ' war stars, '
                     + info.attackWins + ' attacks and ' + info.defenseWins + ' defends this season.'
              output = output + ' Currently ' + humanizedClanRoleMap[info.role] + ' in the clan "' + info.clan.name + '".'
              output = output + ' Discord username: ' + msg.member.user.username
              
            }
            this.channels.audit.sendMessage(output)
          })
          .catch(e => {
            console.log(e)
          })
    }

    const restart_cmd_regex = new RegExp(/^/.source + cmd_prefix + /restart\b *$/.source, 'i')
    /*
    /restart
    - reenter them into db with starter info
    - send signup command info
    */
    else if (restart_cmd_regex.test(msg.content)) {
      this._updateDiscordAccount(msg.member.id, {
          status: 'unknown'
        , type: 'unknown'
        , primaryVillage: null
        , villages: []
      })
      msg.channel.sendMessage('Restart successful, ' + member + '!\n\n' + signupBaseMsg).catch(noop)
    }

    const support_cmd_regex = new RegExp(/^/.source + cmd_prefix + /get-support\b *$/.source, 'i')
    /*
    /get-support
    - set acct.support to true
    - notify @support group
    - send response
    */
    else if (support_cmd_regex.test(msg.content)) {
      acct.support = true
      this._updateDiscordAccount(msg.member.id, acct)
      msg.channel.sendMessage(
          'You are now in support mode and someone from the ' + this.roles.support
        + ' team will be along shortly to help you.  The bot won\'t respond to you '
        + 'further, so you can communicate freely with a support person. At any time, '
        + 'If you\'d like to restart registration from scratch, you can '
        + 'type `' + cmd_prefix + 'restart` at any time.')
    }

    else if (acct && !acct.support) {
      if (acct && acct.status === 'conflict') {
        msg.channel.sendMessage(conflictBaseMsg)
      }
      else if (acct && acct.status === 'uncomfirmed') {
        let output = ('type `' + cmd_prefix + 'confirm ` if the above is correct or '
          + '`' + cmd_prefix + 'restart ` to try again')
        msg.channel.sendMessage(message)
      }
      else if (acct && acct.status === 'onboarding') {
        msg.channel.sendMessage('You\'re almost done... type `' + cmd_prefix + 'next ` to proceed.')
      }
      else {  // status === 'unknown'
        let message = '\n**You won\'t be able to do anything until you register**\n\n' + signupBaseMsg
        msg.channel.sendMessage(message)
      }
    }
  } // END [IF UNKNOWN]
  else if (isMemberUser(msg.member)) {
    // /help
    // /commands

    // /register #CLASHTAG
    // /unregister #CLASHTAG

    // /info
    // /info @DISCORD_USERNAME => /<@[^>]+> */
    // /info #CLASHTAG

    // /members <GNG|HNH|VNV|FNF|RNR>

    // /refresh

    if (isAdminUser(msg.member)) {
      // /register #CLASHTAG to @DISCORD_USERNAME
      // /unregister #CLASHTAG from @DISCORD_USERNAME

      // /joinmsg => shows description and usage
      // /joinmsg <guest|prospect|member> <edit|view>

      // /mustread => shows description and usage
      // /mustread add <message...>
      // /mustread edit <#> <message...>
      // /mustread delete <#>
      // /mustread view <#>
      // /mustread list

    } // END [IF admin]

  } // END [IF member]
}

OnBoard.prototype.onReady = function() {
  if (!this.online) {
    logger.log('online!')
    this.online = true
    this.guild = this.client.guilds.find('name', 'Playmakers Wanted')
    this.channels.welcome = this.guild.channels.find('name', 'register')
    this.channels.general = this.guild.channels.find('name', 'primary-chat')
    this.channels.audit = this.guild.channels.find('name', 'comings-and-goings')
    this.roles.guest = this.guild.roles.find('name', 'Guests')
    this.roles.prospect = this.guild.roles.find('name', 'Prospects')
    this.roles.member = this.guild.roles.find('name', 'Members')
    this.roles.newMember = this.guild.roles.find('name', 'New')
    this.roles.unknown = this.guild.roles.find('name', 'Unknown')
    this.roles.support = this.guild.roles.find('name', 'Support')
    this.roles.family = {}
    for (let [tag, roleName] of Object.entries(clanFamilyRoles)) {
      this.roles.family[roleNmae] = this.guild.roles.find('name', roleName)
    }
  }
}


function getPlayerJSON(apiToken, tag) {
  let stubTag = tag.replace('#', '')
    , fullTag = '#' + stubTag

  if (playerDataCache.has(fullTag)) {
    let data = playerDataCache.get(fullTag)
      , ts = new Date().getTime()
    if (data[0] < ts) {
      return new Promise(resolve) => {
        resolve(data[1])
      }
    }

  }
  return new Promise((resolve, reject) => {
    var p = Request({
        url: API_PLAYER_URL.replace('{TAG}', tag)
      , json: true
      , auth: {
          bearer: apiToken
        }
      }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
          let expiry = new Date().getTime() + (5 * 60 * 1000)
          playerDataCache.set(body.tag, [expiry, body])
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
