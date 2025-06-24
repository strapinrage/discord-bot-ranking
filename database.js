const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'rankings.db'));
        this.init();
    }

    init() {
        this.db.serialize(() => {
            this.db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    username TEXT,
                    message_count INTEGER DEFAULT 0,
                    current_rank INTEGER DEFAULT NULL,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_message_count 
                ON users(message_count DESC)
            `);
        });
    }

    addMessage(userId, username) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT OR REPLACE INTO users (user_id, username, message_count, last_updated)
                VALUES (?, ?, 
                    COALESCE((SELECT message_count FROM users WHERE user_id = ?), 0) + 1,
                    CURRENT_TIMESTAMP
                )
            `, [userId, username, userId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    getTopUsers(limit = 50) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT user_id, username, message_count, current_rank,
                       ROW_NUMBER() OVER (ORDER BY message_count DESC, user_id) as new_rank
                FROM users 
                WHERE message_count > 0
                ORDER BY message_count DESC, user_id
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    updateRanks(users) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                UPDATE users SET current_rank = ? WHERE user_id = ?
            `);

            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');
                
                users.forEach(user => {
                    stmt.run([user.new_rank, user.user_id]);
                });

                this.db.run('COMMIT', (err) => {
                    if (err) {
                        this.db.run('ROLLBACK');
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            stmt.finalize();
        });
    }

    clearRanksOutsideTop(limit = 50) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE users 
                SET current_rank = NULL 
                WHERE user_id NOT IN (
                    SELECT user_id FROM users 
                    WHERE message_count > 0 
                    ORDER BY message_count DESC, user_id 
                    LIMIT ?
                )
            `, [limit], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    close() {
        this.db.close();
    }
}

module.exports = Database;