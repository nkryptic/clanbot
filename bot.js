/*
OVERVIEW:
- when ppl join, send them welcome message after short delay
- make them interact with the bot, keeping track of progress,
  before granting them access?
- need admin rights for the bot
- verify their ign and clan?


what is a "new" member?
- everything a regular member has, except they cannot embed links or attach files


onboarding
- unknown
- member
- guest
- tryout


commands:
- !register member|guest|tryout #CLASHTAG
- !continue
- !list ROLENAME
- !clan...
- !whoami
- !whois DISCORD_USERNAME
- !whohas #CLASHTAG


daily-job
- change guest/tryout to members if their account exists in a clan? (send notification too?)
- change member to guest if none of their accounts are in a clan?
- update member clan roles (GNG/HNH/FNF)
- update member elder/co-leader roles
- update member elder clan roles (GNG Elder...)
- report clan members without link to discord account


logging
- new member/guest/tryout
- member/guest/tryout left/kicked/banned


maintenance
- kick unknown after x days from joining


bots
- mee6
- warmatch
- typicalbot


channels
- register
- welcome-wall
- current-events
- rank-current-events
- hnh-news
- gng-news
- new-member-info
- co-leaders
- elders
- primary-chat
- hnh-warroom
- gng-warroom
- fnf-warroom
- just-for-fun
- bot-testing
- comings-and-goings
- suggestions
- questions
- loot-forecast
- update-news



  https://discordapp.com/oauth2/authorize?client_id=281883945933733888&scope=bot&permissions=8
  permissions=183296
  permissions=8
*/

const Request = require('request')
    , Discord = require('discord.js')
    , Storage = require('node-storage')
const botToken = 'APP_BOT_USER_TOKEN'
const apiToken = 'CLASH_API_TOKEN'
const API_PLAYER_URL = 'https://api.clashofclans.com/v1/players/%23{TAG}'
const API_CLAN_MEMBERS_URL = 'https://api.clashofclans.com/v1/clans/%23{TAG}/members'
const register_member_regex = new RegExp(/^!register +member +#?([a-zA-Z0-9]+) *$/, 'i')
const register_prospect_regex = new RegExp(/^!register +guest +#?([a-zA-Z0-9]+) *$/, 'i')
const noop = () => {}
// const register_guest_regex = new RegExp(/^!register +guest *$/, 'i')

const rulesMsg = '**General Rules**\n'
               + '1. No clan hopping\n'
               + '2. Max your base before upgrading your TH\n'
               + '3. Must utilize a .5 strategy after after upgrading your TH\n'
               + '4. Opt out of war if heroes are upgrading\n'
               + '5. Only elders are allowed to have two accounts in the same roster\n'
               + '** **\n'
               + '**Donating/Requesting Rules**\n'
               + '1. Request, raid, repeat - request and use your CC troops for every loot raid\n'
               + '2. Abide by your clan\'s requesting rules for loot raiding:\n'
               + '   HNH - Elixir troop specific requests allowed - `air, ground, any, meat, clean up, defense`are typically filled faster though.\n'
               + '   GNG - Request for anything you can donate, but general requests are filled faster\n'
               + '   FNF - General requests only\n'
               + '3. Donate too! - no donation ratio is required, but you should fill a request when requesting\n'
               + '4. Specific requests for war or friendly challenges are always allowed, but note it in the request to avoid confusion'

const familyMsg = '**Clan Family Structure:**\n'
                + 'We have four clans to choose from. The choice comes at the start of the new season. \n'
                + '\n'
                + 'Heart N Hustle - Level 11 - type `!hnh ` for more info\n'
                + 'Grit N Grind - Level 9 - type `!gng ` for more info\n'
                + 'Fire N Fury - Level 6 - type `!fnf ` for more info\n'
                + 'Rest N Relax - Level 1 - type `!rnr` for more info\n'
                + '\n'
                + '**Changing Rosters**\n'
                + '- Each season members will be able to choose the roster they wish to participate in\n'
                + '- Season long commitment, no hopping midseason unless approved by Teske22'

var db = new Storage('./clanbot.db')
var bot = new Discord.Client()
var data = {chan: null, chan2: null, roles: {guest: null, member: null}}
var clanFamilyTags = ['#9V00QQ9G', '#88JQ8VPQ', '#YL0YV9Q']
const clanRoleMap = {leader: 'a leader', coLeader: 'a co-leader', admin: 'an elder', member: 'a member'}

bot.on('ready', () => {
  data.chan = bot.channels.find('name', 'reception')
  data.chan2 = bot.channels.find('name', 'general')
  data.roles.guest = data.chan.guild.roles.find('name', 'guest')
  data.roles.member = data.chan.guild.roles.find('name', 'member')
  data.roles.unknown = data.chan.guild.roles.find('name', 'unknown')

  data.users = new Map(db.get('users'))
  data.accounts = {
      clash: new Map(db.get('accounts.clash') || [])
    , discord: new Map(db.get('accounts.discord') || [])
  }
})
bot.on('message', msg => {
  console.log('onmessage')
  if (msg.author.bot) {
    return
  }
  // if (msg.member.roles.has(data.roles.guest.id) or msg.member.roles.has(data.roles.member.id)) {
  //   return
  // }
  console.log('onmessage 2')

  if (msg.member.roles.has(data.roles.unknown.id)) {
    if (register_member_regex.test(msg.content)) {
      match = register_member_regex.exec(msg.content)
      if (match) {
        getPlayerJSON(match[1])
          .then(info => {
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
          })
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
})
bot.on('guildMemberAdd', member => {
  console.log('guildMemberAdd')
  if (member.user.bot) {return}

  data.chan.startTyping()
  // on join, send unknown users the registration instructions:
  member.addRole(data.roles.unknown).catch(noop)
  data.accounts.discord.set(member.id, {
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
})
bot.on('guildMemberRemove', member => {
  console.log('guildMemberRemove')
})

bot.login(botToken)


// function addAccount(member, clashid) {
//   let owned = data.accounts.discord.get(member.id) || []
//   if (clashid and owned.indexOf(clashid) === -1) {
//     owned.push(clashid)
//   }
//   data.accounts.discord.set(member.id, owned)
//   if (clashid) {
//     data.accounts.clash.set(clashid, member.id)
//   }

//   db.put('accounts.discord', Array.from(data.accounts.discord.entries()))
//   db.put('accounts.clash', Array.from(data.accounts.clash.entries()))
// }

function getPlayerJSON(tag) {
  tag = tag.replace('#', '')
  return new Promise((resolve, reject) => {
    var p = Request({
        url: BASE_URL + tag
      , json: true
      , auth: {
          bearer: apiToken
        }
      }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
          // console.log(body.clan)
          resolve(body)
        }
        else {
          reject(error)
        }
      })
  })
}

