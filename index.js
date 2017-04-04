/*
onboard
  /register member|guest|tryout #CLASHTAG

  /member #CLASHTAG
  /register #CLASHTAG

  /apply #CLASHTAG
  /recruit #CLASHTAG
  /tryout #CLASHTAG
  /join #CLASHTAG

  /guest [#CLASHTAG]
  /visit [#CLASHTAG]

  /continue
  /next

  /refresh

  MEMBER-ONLY COMMANDS
  /add #CLASHTAG [to @DISCORD_USERNAME]
  /addmini #CLASHTAG [to @DISCORD_USERNAME]
  /register #CLASHTAG [to @DISCORD_USERNAME]
  /unregister #CLASHTAG
  /primary #CLASHTAG

  /clan...
  /whoami
  /whois DISCORD_USERNAME
  /whois @DISCORD_USERNAME
  /whohas #CLASHTAG
  /claninfo
  /claninfo DISCORD_USERNAME
  /claninfo CLAN
  /claninfo

discordplus
  /dc rolelist
  /dc list ROLENAME

warwatch
  /warwatch status  - list war reminders
  /warwatch roster  - list clan accounts with their registered owner
  Admin-only commands:
  /warwatch ignore #CLASHTAG  - don't ping a clan account
  /warwatch restore #CLASHTAG  - stop ignoring a clan account

forecast
  /forecast
  /forecast subscribe [good|great|excellent]
  /forecast unsubscribe

customcommand


To add to server with administrator permission:
https://discordapp.com/oauth2/authorize?client_id=APPLICATION_CLIENT_ID&permissions=8&scope=bot 
see other perms: https://discordapp.com/developers/docs/topics/permissions
*/

const config   = require('./config.json')
const Discord  = require('discord.js');
const Logger   = require('./logger.js')

const logger = new Logger('clanBot')
logger.log('starting initial setup')

var bot = new Discord.Client()
bot.on('ready', () => { logger.log('ready!') })
bot.on('reconnecting', () => { logger.error('reconnecting to discord') })

bot.login(config.botToken)
