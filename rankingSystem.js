const { PermissionFlagsBits } = require('discord.js');

class RankingSystem {
    constructor(client, database) {
        this.client = client;
        this.db = database;
        this.pendingUpdates = new Set();
        this.updateCooldown = 300000;
        this.excludedRoleIds = [ 
            '1371527940822794380', // id role admin
            '1385700563349405908', // id role admin
            '1371527942617829438', // id role admin
            '1371527943859470487', // id role admin 
            '1371527944748535809', // id role admin
            '1372532678875942913', // id role admin
        ];
    }

    async handleMessage(message) {
        if (message.author.bot) return;

        const member = await message.guild.members.fetch(message.author.id).catch(() => null);
        if (!member) return;

        if (member.roles.cache.some(role => this.excludedRoleIds.includes(role.id))) return;

        await this.db.addMessage(message.author.id, message.author.username);

        if (!this.pendingUpdates.has(message.guild.id)) {
            this.pendingUpdates.add(message.guild.id);

            setTimeout(() => {
                this.updateRankings(message.guild);
                this.pendingUpdates.delete(message.guild.id);
            }, this.updateCooldown);
        }
    }

    async updateRankings(guild) {
        try {
            console.log('Sprawdzam zmiany w rankingu...');

            const topUsers = await this.db.getTopUsers(50);

            const changedUsers = topUsers.filter(user =>
                user.current_rank !== user.new_rank
            );

            if (changedUsers.length === 0) {
                console.log('Brak zmian w rankingu');
                return;
            }

            console.log(`Znaleziono ${changedUsers.length} zmian w rankingu`);

            await this.db.updateRanks(topUsers);
            await this.db.clearRanksOutsideTop(50);

            await this.updateServerRoles(guild, topUsers, changedUsers);

        } catch (error) {
            console.error('Błąd podczas aktualizacji rankingu:', error);
        }
    }

    async updateServerRoles(guild, topUsers, changedUsers) {
        try {
            const roles = await guild.roles.fetch();
            const rankRoles = new Map();

            for (let i = 1; i <= 50; i++) {
                const role = roles.find(r => r.name === `${i}`);
                if (role) {
                    rankRoles.set(i, role);
                }
            }

            for (const userData of changedUsers) {
                try {
                    const member = await guild.members.fetch(userData.user_id).catch(() => null);
                    if (!member) continue;

                    const oldRankRoles = member.roles.cache.filter(role =>
                        /^\d+$/.test(role.name) && parseInt(role.name) >= 1 && parseInt(role.name) <= 50
                    );

                    if (oldRankRoles.size > 0) {
                        await member.roles.remove(oldRankRoles.map(r => r.id));
                    }

                    let newRole = rankRoles.get(userData.new_rank);
                    if (!newRole) {
                        console.warn(`Brakuje roli dla rangi ${userData.new_rank} – próba utworzenia`);
                        newRole = await this.createSingleRankRole(guild, userData.new_rank);
                        if (newRole) {
                            rankRoles.set(userData.new_rank, newRole);
                        }
                    }

                    if (newRole) {
                        await member.roles.add(newRole);
                        console.log(`🎖️ ${member.user.username}: ${userData.current_rank || 'brak'} → ${userData.new_rank}`);
                    }

                } catch (error) {
                    console.error(`Błąd podczas aktualizacji ról dla ${userData.username}:`, error.message);
                }
            }

            await this.removeRolesFromNonTopUsers(guild, topUsers, rankRoles);

        } catch (error) {
            console.error('Błąd podczas aktualizacji ról:', error);
        }
    }

    async createSingleRankRole(guild, rank) {
        try {
            console.log(`Tworzę rolę: ${rank}`);

            const roles = await guild.roles.fetch();
            const existingRole = roles.find(r => r.name === `${rank}`);
            if (existingRole) {
                console.log(`Rola ${rank} już istnieje`);
                return existingRole;
            }

            const role = await guild.roles.create({
                name: `${rank}`,
                mentionable: false,
                hoist: true,
                reason: `Automatyczna rola rankingowa - ranga ${rank}`
            });

            console.log(`Utworzono rolę: ${rank}`);
            return role;

        } catch (error) {
            console.error(`Nie udało się utworzyć roli ${rank}:`, error.message);
            return null;
        }
    }

    async removeRolesFromNonTopUsers(guild, topUsers, rankRoles) {
        try {
            const topUserIds = new Set(topUsers.map(u => u.user_id));

            const allMembers = await guild.members.fetch();

            for (const [memberId, member] of allMembers) {
                if (member.user.bot || topUserIds.has(memberId)) continue;

                const memberRankRoles = member.roles.cache.filter(role =>
                    /^\d+$/.test(role.name) && parseInt(role.name) >= 1 && parseInt(role.name) <= 50
                );

                if (memberRankRoles.size > 0) {
                    await member.roles.remove(memberRankRoles.map(r => r.id));
                    console.log(`Usunięto role rankingowe od ${member.user.username} (poza top 50)`);
                }
            }

        } catch (error) {
            console.error('Błąd podczas usuwania ról:', error);
        }
    }

    async getLeaderboard(limit = 10) {
        return await this.db.getTopUsers(limit);
    }
}

module.exports = RankingSystem;