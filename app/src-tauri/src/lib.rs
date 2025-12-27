use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use std::path::PathBuf;
use std::fs;

#[derive(Serialize, Deserialize, Debug)]
struct Account {
    id: i32,
    name: String,
    balance: f64,
}

fn get_db_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    Ok(app_dir.join("honeybear.db"))
}

fn init_db(app_handle: &AppHandle) -> Result<(), String> {
    let db_path = get_db_path(app_handle)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            balance REAL NOT NULL
        )",
        [],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn create_account(app_handle: AppHandle, name: String, balance: f64) -> Result<Account, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO accounts (name, balance) VALUES (?1, ?2)",
        params![name, balance],
    ).map_err(|e| e.to_string())?;
    
    let id = conn.last_insert_rowid() as i32;
    
    Ok(Account {
        id,
        name,
        balance,
    })
}

#[tauri::command]
fn get_accounts(app_handle: AppHandle) -> Result<Vec<Account>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT id, name, balance FROM accounts").map_err(|e| e.to_string())?;
    let account_iter = stmt.query_map([], |row| {
        Ok(Account {
            id: row.get(0)?,
            name: row.get(1)?,
            balance: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut accounts = Vec::new();
    for account in account_iter {
        accounts.push(account.map_err(|e| e.to_string())?);
    }
    
    Ok(accounts)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            init_db(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, create_account, get_accounts])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
