import * as discord from "discord.js";
import dotenv from "dotenv";
import { Document, MongoClient, ObjectId, WithId } from "mongodb";

dotenv.config();

const client: discord.Client = new discord.Client({
    intents: [
        "DIRECT_MESSAGES",
        "GUILD_MESSAGES",
        "GUILD_MESSAGE_REACTIONS",
        "GUILD_MEMBERS",
        "GUILDS"
    ],
    partials: [
        "CHANNEL"
    ]
});

(async () => {
    const DB = await MongoClient.connect(`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.${process.env.DB_NAME}.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`);

    console.log("DB ready");

    client.on("ready", (): void => {
        console.log(`Logged in as ${client.user.tag}`);
    });

    client.on("messageCreate", async (msg: discord.Message): Promise<any> => {
        if(msg.guild) return;
        if(!msg.content.match(/^send/i)) return;

        const DM = msg.channel;
        const user = msg.author.id;

        if(user === client.user.id) return;

        const guilds = client.guilds.cache;
        const mutualGuilds: discord.Collection<string, discord.Guild> = guilds.filter((guild: discord.Guild): boolean => !!guild.members.resolveId(user));

        if(!mutualGuilds.size) return DM.send("Looks like we don't share anys servers, or something's wrong...");

        DM.send(`You share the following servers with me:\n\n${mutualGuilds.map((guild: discord.Guild): string => guild.name).map((v: string, i: number): string => `${i + 1}. \`${v}\``).join("\n")}\n\nWhich would you like to send a message in? (Send the number that's before the server's name)`);

        const collector: discord.MessageCollector = new discord.MessageCollector(DM, {
            max: 1,
            time: 60 * 1000,
            filter: (msg: discord.Message): boolean => msg.author.id === user
        });

        collector.on("collect", async (msg: discord.Message): Promise<any> => {
            const num = Number(msg.content);

            if(!num) return DM.send("That is not a valid number. Process canceled. ");
            
            const guild = mutualGuilds.at(num - 1);
            
            if(!guild) return DM.send("That is not a valid server. Process canceled. ");

            const guildDB = await DB.db("Bot").collection("Guilds").findOne({ "id": guild.id }) as { _id: ObjectId, channels: string[], logging: string };
            const guildMember = await guild.members.fetch(user);
            const channels: discord.Collection<string, discord.GuildBasedChannel> = guild.channels.cache.filter((channel: discord.Channel): boolean => {
                const perms = (channel as discord.GuildTextBasedChannel).permissionsFor(guildMember)
                return channel.isText && guildDB.channels.indexOf(channel.id) !== -1 && perms.has("SEND_MESSAGES") && perms.has("VIEW_CHANNEL")
            });
            const logging: discord.GuildBasedChannel = guild.channels.cache.get(guildDB.logging);

            if(!channels.size) return DM.send("You don't have access to any of the channels configured to allow anonymous messages. Sorry :(");

            DM.send(`${guild.name} has the following channels configured to allow anonymous messages:\n\n${channels.map((v: discord.GuildBasedChannel): string => v.parent?.name ? `Channel \`${v.name}\` in category \`${v.parent.name}\`` : `Channel \`${v.name}\` (no category)`).map((v: string, i: number): string => `${i + 1}. ${v}`).join("\n")}\n\nWhich would you like to send a message in? (Send the number that's before the channel's name)`);

            const collector: discord.MessageCollector = new discord.MessageCollector(DM, {
                max: 1,
                time: 60 * 1000,
                filter: (msg: discord.Message): boolean => msg.author.id === user
            });
    
            collector.on("collect", async (msg: discord.Message): Promise<any> => {
                const num = Number(msg.content);
    
                if(!num) return DM.send("That is not a valid number. Process canceled. ");
                
                const channel = channels.at(num - 1);
                
                if(!channel) return DM.send("That is not a valid channel. Process canceled. ");

                DM.send(`What would you like to say in \`${channel.name}\`? Attachments will not be sent for security reasons. `);

                const collector: discord.MessageCollector = new discord.MessageCollector(DM, {
                    max: 1,
                    time: 60 * 1000,
                    filter: (msg: discord.Message): boolean => msg.author.id === user
                });

                collector.on("collect", async (msg: discord.Message): Promise<any> => {
                    if(!msg.content) return;

                    const anonMsg = await (channel as discord.BaseGuildTextChannel).send(`Anonymous user sent:\n> ${msg.content.replace(/\n/gi, "\n> ")}`);
                    (logging as discord.BaseGuildTextChannel).send(`||${msg.author.tag}|| sent <${anonMsg.url}>. View name only for moderation purposes`);
                });
            });
        });
    });

    client.login(process.env.TOKEN);
})();