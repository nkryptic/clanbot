/*
onboard
  ONBOARDING COMMANDS
    /register #CLASHTAG
    /apply #CLASHTAG
    /visit #CLASHTAG
    /confirm
    /next
    /restart
    /get-support
  MEMBER-ONLY COMMANDS
    /help
    /commands
    /register #CLASHTAG
    /unregister #CLASHTAG
    /info
    /info @DISCORD_USERNAME
    /info #CLASHTAG
    /members <GNG|HNH|VNV|FNF|RNR>
    /refresh ????
  ADMIN-ONLY COMMANDS
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
