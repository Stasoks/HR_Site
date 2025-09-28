from fastapi import FastAPI, HTTPException, Depends, status, Request, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, func, case, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional, List
import jwt
import os
import json
import shutil
from pathlib import Path
from pydantic import BaseModel

# Настройка FastAPI
app = FastAPI(title="HR Portal", version="1.0.0")

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Глобальный обработчик ошибок
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

# Создание директории для загрузки файлов
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Настройка статических файлов
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Настройка базы данных
DATABASE_URL = "sqlite:///./instance/Users.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Настройка безопасности
SECRET_KEY = "your-secret-key-here-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 33333
ADMIN_SECRET_KEY = "hrstake-admin-2024"  # Secret key for admin access

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
# Модели базы данных
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    telegram_username = Column(String)
    hashed_password = Column(String, nullable=False)
    balance = Column(Float, default=100.0)
    level = Column(String, default="basic")  # basic, silver, gold, platinum
    is_admin = Column(Boolean, default=False)
    is_verified = Column(Boolean, default=False)
    documents_accepted = Column(Boolean, default=False)
    tour_completed = Column(Boolean, default=False)  # Track if user completed onboarding tour
    is_fake = Column(Boolean, default=False)  # Для тестовых пользователей
    min_withdrawal_amount = Column(Float, default=50.0)  # Минимальная сумма вывода для пользователя
    withdrawal_enabled = Column(Boolean, default=True)  # Доступ к выводу средств
    created_at = Column(DateTime, default=datetime.utcnow)
    


class Task(Base):
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    required_proof = Column(Text, nullable=False)  # Необходимые доказательства
    reward = Column(Float, nullable=False)
    level_required = Column(String, default="basic")  # basic, silver, gold, platinum
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)
    time_limit_hours = Column(Integer, default=None)  # Time limit in hours
    is_active = Column(Boolean, default=True)

class UserTask(Base):
    __tablename__ = "user_tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    task_id = Column(Integer, ForeignKey("tasks.id"))
    status = Column(String, nullable=False)  # taken, submitted, approved, rejected, revision, expired
    taken_at = Column(DateTime, default=datetime.utcnow)  # Когда пользователь взял задание
    expires_at = Column(DateTime)  # Когда истекает время выполнения
    submitted_at = Column(DateTime)
    approved_at = Column(DateTime)
    proof = Column(Text)  # JSON string with proof text
    proof_files = Column(Text)  # JSON string with file paths
    proof_links = Column(Text)  # JSON string with links
    admin_comment = Column(Text)

class News(Base):
    __tablename__ = "news"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"))
    sender_name = Column(String, nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # For admin messages to specific users
    chat_type = Column(String, default="general")  # general, support
    message = Column(Text, nullable=False)
    is_admin = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    is_read = Column(Boolean, default=False)  # Track if message is read by recipient

class ChatReadState(Base):
    __tablename__ = "chat_read_state"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    chat_type = Column(String, nullable=False)  # 'general' or 'support'
    counterpart_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # admin/user id for direct chats
    last_read_at = Column(DateTime, default=datetime(1970, 1, 1))

class Setting(Base):
    __tablename__ = "settings"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False)
    value = Column(Text, nullable=False)
    description = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class WithdrawalRequest(Base):
    __tablename__ = "withdrawal_requests"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    network_coin = Column(String, nullable=False)  # USDT, BEP20, TRON, ETHEREUM
    amount = Column(Float, nullable=False)
    wallet_address = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending, completed
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

class LeaderManagement(Base):
    __tablename__ = "leader_management"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    leader_type = Column(String, nullable=False)  # 'top_earner', 'most_productive', 'quality_leader'
    rank_position = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class LeaderStatistics(Base):
    __tablename__ = "leader_statistics"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    leader_type = Column(String, nullable=False)
    metric_value = Column(Float, default=0)  # баланс, количество заданий, процент принятия
    period_start = Column(DateTime)
    period_end = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

class VerificationRequest(Base):
    __tablename__ = "verification_requests"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    full_name = Column(String, nullable=False)
    date_of_birth = Column(String, nullable=False)
    passport_number = Column(String, nullable=False)
    passport_issue_date = Column(String, nullable=False)
    passport_issuer = Column(String, nullable=False)
    address = Column(Text, nullable=False)
    phone_number = Column(String, nullable=False)
    document_front = Column(String, nullable=True)  # Путь к файлу
    document_back = Column(String, nullable=True)   # Путь к файлу
    selfie_with_document = Column(String, nullable=True)  # Путь к файлу
    status = Column(String, default="pending")  # pending, approved, rejected
    admin_comment = Column(Text, nullable=True)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # ID админа, который рассмотрел
    


class UserEvent(Base):
    __tablename__ = "user_events"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    event_type = Column(String, nullable=False)  # account_created, verified, withdrawal_request, etc.
    event_description = Column(Text, nullable=False)
    event_data = Column(Text, nullable=True)  # JSON data for additional info
    created_at = Column(DateTime, default=datetime.utcnow)

# Создание таблиц
Base.metadata.create_all(bind=engine)

def get_global_min_withdrawal_amount(db: Session) -> float:
    """Получение глобальной минимальной суммы вывода из настроек"""
    try:
        global_setting = db.query(Setting).filter(Setting.key == "global_min_withdrawal_amount").first()
        if global_setting:
            return float(global_setting.value)
        else:
            return 50.0  # Значение по умолчанию
    except Exception as e:
        print(f"⚠️ Error getting global min withdrawal amount: {e}")
        return 50.0  # Значение по умолчанию

# Функция для обновления базы данных с новыми полями
def update_database_schema():
    try:
        # Проверяем, существует ли колонка min_withdrawal_amount в таблице users
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('users')]
        
        if 'min_withdrawal_amount' not in columns:
            # Добавляем новую колонку
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN min_withdrawal_amount FLOAT DEFAULT 50.0"))
                conn.commit()
            print("✅ Добавлена колонка min_withdrawal_amount в таблицу users")
        
        # Проверяем, существует ли колонка withdrawal_enabled в таблице users
        if 'withdrawal_enabled' not in columns:
            # Добавляем новую колонку
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN withdrawal_enabled BOOLEAN DEFAULT TRUE"))
                conn.commit()
            print("✅ Добавлена колонка withdrawal_enabled в таблицу users")
        
        # Проверяем, существует ли настройка глобальной минимальной суммы вывода
        db = SessionLocal()
        global_min_withdrawal = db.query(Setting).filter(Setting.key == "global_min_withdrawal_amount").first()
        if not global_min_withdrawal:
            global_min_withdrawal = Setting(
                key="global_min_withdrawal_amount",
                value="50.0",
                description="global minimum withdrawal amount for all users"
            )
            db.add(global_min_withdrawal)
            db.commit()
            print("✅ Global minimum withdrawal amount setting added")
        
        # Проверяем, существует ли таблица verification_requests
        tables = inspector.get_table_names()
        # print(f"📋 Найденные таблицы: {tables}")
        
        if 'verification_requests' not in tables:
            # print("🔧 Создаем таблицу verification_requests...")
            try:
                # Создаем таблицу verification_requests
                VerificationRequest.__table__.create(engine)
                print("✅ Создана таблица verification_requests")
                
                    
            except Exception as e:
                print(f"❌ Ошибка при создании таблицы verification_requests: {e}")
                # Попробуем создать таблицу напрямую через SQL
                try:
                    with engine.connect() as conn:
                        conn.execute(text('''
                            CREATE TABLE IF NOT EXISTS verification_requests (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                user_id INTEGER NOT NULL,
                                full_name VARCHAR NOT NULL,
                                date_of_birth VARCHAR NOT NULL,
                                passport_number VARCHAR NOT NULL,
                                passport_issue_date VARCHAR NOT NULL,
                                passport_issuer VARCHAR NOT NULL,
                                address TEXT NOT NULL,
                                phone_number VARCHAR NOT NULL,
                                document_front VARCHAR,
                                document_back VARCHAR,
                                selfie_with_document VARCHAR,
                                status VARCHAR DEFAULT 'pending',
                                admin_comment TEXT,
                                submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                reviewed_at DATETIME,
                                reviewed_by INTEGER,
                                FOREIGN KEY (user_id) REFERENCES users (id),
                                FOREIGN KEY (reviewed_by) REFERENCES users (id)
                            )
                        '''))
                        conn.commit()
                        print("✅ Таблица verification_requests создана через SQL")
                except Exception as sql_error:
                    print(f"❌ Ошибка при создании таблицы через SQL: {sql_error}")
        else:
            print("✅ Таблица verification_requests уже существует")
        
        # Проверяем, существует ли таблица user_events
        if 'user_events' not in tables:
            print("🔧 Создаем таблицу user_events...")
            try:
                # Создаем таблицу user_events
                UserEvent.__table__.create(engine)
                print("✅ Создана таблица user_events")
            except Exception as e:
                print(f"❌ Ошибка при создании таблицы user_events: {e}")
                # Попробуем создать таблицу напрямую через SQL
                try:
                    with engine.connect() as conn:
                        conn.execute(text('''
                            CREATE TABLE IF NOT EXISTS user_events (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                user_id INTEGER NOT NULL,
                                event_type VARCHAR NOT NULL,
                                event_description TEXT NOT NULL,
                                event_data TEXT,
                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                FOREIGN KEY (user_id) REFERENCES users (id)
                            )
                        '''))
                        conn.commit()
        
                        print("✅ Таблица user_events создана через SQL")
                except Exception as sql_error:
                    print(f"❌ Ошибка при создании таблицы user_events через SQL: {sql_error}")
        else:
            print("✅ Таблица user_events уже существует")
        
        # Проверяем, существует ли поле is_read в таблице chat_messages
        if 'chat_messages' in tables:
            chat_columns = [col['name'] for col in inspector.get_columns('chat_messages')]
            if 'is_read' not in chat_columns:
                print("🔧 Добавляем поле is_read в таблицу chat_messages...")
                try:
                    with engine.connect() as conn:
                        conn.execute(text("ALTER TABLE chat_messages ADD COLUMN is_read BOOLEAN DEFAULT FALSE"))
                        conn.commit()
                    print("✅ Добавлено поле is_read в таблицу chat_messages")
                except Exception as e:
                    print(f"❌ Ошибка добавления поля is_read: {e}")
            else:
                print("✅ Поле is_read уже существует в таблице chat_messages")
        
        # Проверяем и добавляем новые поля в таблицу user_tasks
        user_tasks_columns = [col['name'] for col in inspector.get_columns('user_tasks')]
        
        if 'taken_at' not in user_tasks_columns:
            print("🔧 Добавляем поле taken_at в таблицу user_tasks...")
            try:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE user_tasks ADD COLUMN taken_at DATETIME"))
                    conn.commit()
                print("✅ Поле taken_at добавлено")
            except Exception as e:
                print(f"❌ Ошибка добавления поля taken_at: {e}")
        
        if 'expires_at' not in user_tasks_columns:
            print("🔧 Добавляем поле expires_at в таблицу user_tasks...")
            try:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE user_tasks ADD COLUMN expires_at DATETIME"))
                    conn.commit()
                print("✅ Поле expires_at добавлено")
            except Exception as e:
                print(f"❌ Ошибка добавления поля expires_at: {e}")
        
        # Обновляем существующие записи в user_tasks
        try:
            with engine.connect() as conn:
                # Устанавливаем taken_at текущим временем для записей в статусе 'taken', где taken_at отсутствует
                conn.execute(text("""
                    UPDATE user_tasks 
                    SET taken_at = CURRENT_TIMESTAMP 
                    WHERE taken_at IS NULL AND status = 'taken'
                """))
                
                # Устанавливаем expires_at = taken_at + 24 часа (или от текущего времени, если taken_at по какой‑то причине пуст)
                conn.execute(text("""
                    UPDATE user_tasks 
                    SET expires_at = datetime(COALESCE(taken_at, CURRENT_TIMESTAMP), '+24 hours') 
                    WHERE expires_at IS NULL AND status = 'taken'
                """))
                
                conn.commit()
                print("✅ Обновлены существующие записи в user_tasks")
        except Exception as e:
            print(f"❌ Ошибка обновления существующих записей: {e}")
        
        db.close()
        
    except Exception as e:
        print(f"⚠️ Ошибка при обновлении схемы базы данных: {e}")

# Обновляем схему базы данных
update_database_schema()

# Pydantic модели
class UserCreate(BaseModel):
    first_name: str
    last_name: str
    email: str
    telegram_username: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class TaskCreate(BaseModel):
    title: str
    description: str
    required_proof: str
    reward: float
    level_required: str = "basic"
    expires_at: Optional[datetime] = None
    time_limit_hours: Optional[int] = None  # Time limit in hours

class NewsCreate(BaseModel):
    title: str
    content: str
    created_at: Optional[datetime] = None

class ChatMessageCreate(BaseModel):
    message: str
    chat_type: str = "general"
    recipient_id: Optional[int] = None

class SettingUpdate(BaseModel):
    value: str

class UserUpdate(BaseModel):
    balance: Optional[float] = None
    min_withdrawal_amount: Optional[float] = None
    level: Optional[str] = None
    is_verified: Optional[bool] = None
    is_admin: Optional[bool] = None
    withdrawal_enabled: Optional[bool] = None
    tasks_completed: Optional[int] = None
    approval_rate: Optional[float] = None

class GlobalSettingUpdate(BaseModel):
    global_min_withdrawal_amount: float

class VerificationRequestCreate(BaseModel):
    full_name: str
    date_of_birth: str
    passport_number: str
    passport_issue_date: str
    passport_issuer: str
    address: str
    phone_number: str
    document_front: Optional[str] = None
    document_back: Optional[str] = None
    selfie_with_document: Optional[str] = None

class VerificationReview(BaseModel):
    status: str  # approved, rejected
    admin_comment: Optional[str] = None

class WithdrawalRequestCreate(BaseModel):
    network_coin: str
    amount: float
    wallet_address: str

# Функции для работы с паролями и токенами
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return int(user_id)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

# Dependency для получения сессии БД
def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()

# Dependency для получения текущего пользователя
def get_current_user(user_id: int = Depends(verify_token), db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

# Функция для создания событий пользователя
def create_user_event(db: Session, user_id: int, event_type: str, event_description: str, event_data: str = None):
    """Создает запись о событии пользователя"""
    try:
        user_event = UserEvent(
            user_id=user_id,
            event_type=event_type,
            event_description=event_description,
            event_data=event_data
        )
        db.add(user_event)
        db.commit()
        print(f"✅ User event created: {event_type} for user {user_id}")
    except Exception as e:
        print(f"❌ Error creating user event: {e}")
        db.rollback()

# Функция для проверки истечения заданий (отключена)
def check_expired_tasks(db: Session):
    """Checks and marks expired tasks as expired - DISABLED"""
    # Отключено - задания больше не помечаются как expired
    return 0

# Функции для работы с непрочитанными сообщениями
def get_unread_message_count(db: Session, user_id: int, chat_type: str = None) -> int:
    """Получить количество непрочитанных сообщений для пользователя"""
    try:
        if chat_type:
            # Для конкретного чата
            last_read = db.query(ChatReadState).filter(
                ChatReadState.user_id == user_id,
                ChatReadState.chat_type == chat_type
            ).first()
            
            if not last_read:
                # Если записи нет, считаем все сообщения непрочитанными
                # Включаем сообщения от системного пользователя (sender_id = 0) и других пользователей
                return db.query(ChatMessage).filter(
                    ChatMessage.chat_type == chat_type,
                    ChatMessage.sender_id != user_id
                ).count()
            
            # Считаем сообщения после последнего прочтения
            # Включаем сообщения от системного пользователя (sender_id = 0) и других пользователей
            return db.query(ChatMessage).filter(
                ChatMessage.chat_type == chat_type,
                ChatMessage.sender_id != user_id,
                ChatMessage.timestamp > last_read.last_read_at
            ).count()
        else:
            # Общее количество непрочитанных сообщений
            total_unread = 0
            
            # Для общего чата
            general_unread = get_unread_message_count(db, user_id, "general")
            total_unread += general_unread
            
            # Для чата поддержки
            support_unread = get_unread_message_count(db, user_id, "support")
            total_unread += support_unread
            
            return total_unread
    except Exception as e:
        print(f"Error getting unread count: {e}")
        return 0

def mark_chat_as_read(db: Session, user_id: int, chat_type: str):
    """Отметить чат как прочитанный"""
    try:
        read_state = db.query(ChatReadState).filter(
            ChatReadState.user_id == user_id,
            ChatReadState.chat_type == chat_type
        ).first()
        
        if read_state:
            read_state.last_read_at = datetime.utcnow()
        else:
            read_state = ChatReadState(
                user_id=user_id,
                chat_type=chat_type,
                last_read_at=datetime.utcnow()
            )
            db.add(read_state)
        
        db.commit()
    except Exception as e:
        print(f"Error marking chat as read: {e}")

def initialize_new_user_chat_state(db: Session, user_id: int):
    """Инициализировать состояние чата для нового пользователя"""
    try:
        # Создаем записи о прочтении для обоих чатов
        # Устанавливаем время прочтения в прошлое, чтобы все существующие сообщения считались непрочитанными
        past_time = datetime(2020, 1, 1)
        
        for chat_type in ["general", "support"]:
            existing_state = db.query(ChatReadState).filter(
                ChatReadState.user_id == user_id,
                ChatReadState.chat_type == chat_type
            ).first()
            
            if not existing_state:
                read_state = ChatReadState(
                    user_id=user_id,
                    chat_type=chat_type,
                    last_read_at=past_time
                )
                db.add(read_state)
        
        db.commit()
    except Exception as e:
        print(f"Error initializing user chat state: {e}")

# Маршруты
@app.get("/login", response_class=HTMLResponse)
async def login_page():
    return FileResponse("static/login.html", media_type="text/html")

@app.get("/", response_class=HTMLResponse)
async def read_root():
    # Just serve the main page - auth check is done on frontend
    return FileResponse("static/index.html", media_type="text/html")

@app.get("/documents", response_class=HTMLResponse)
async def documents_page():
    return FileResponse("static/documents.html", media_type="text/html")

@app.post("/register")
async def register(user: UserCreate, db: Session = Depends(get_db)):
    try:
        # Проверка существования пользователя (case-insensitive)
        existing_user = db.query(User).filter(func.lower(User.email) == func.lower(user.email)).first()
        if existing_user:
            print(f"⚠️ Registration attempt with existing email: {user.email}")
            print(f"⚠️ Existing user: ID={existing_user.id}, Email={existing_user.email}")
            raise HTTPException(status_code=400, detail=f"User with email {user.email} already registered. Please try to login.")
        
        # Получаем глобальную минимальную сумму вывода
        global_min_amount = get_global_min_withdrawal_amount(db)
        
        # Создание нового пользователя
        hashed_password = get_password_hash(user.password)
        db_user = User(
            first_name=user.first_name,
            last_name=user.last_name,
            email=user.email,
            telegram_username=user.telegram_username,
            hashed_password=hashed_password,
            min_withdrawal_amount=global_min_amount  # Используем глобальную настройку
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        
        print(f"✅ New user registered with min withdrawal amount: ${global_min_amount}")
        
        # Создаем событие о создании аккаунта
        create_user_event(db, db_user.id, "account_created", "account created")
        
        # Инициализируем состояние чата для нового пользователя
        initialize_new_user_chat_state(db, db_user.id)
        
        # Создаем токен для новоизорегистрированного пользователя
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(db_user.id)}, expires_delta=access_token_expires
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": db_user.id,
                "first_name": db_user.first_name,
                "last_name": db_user.last_name,
                "email": db_user.email,
                "balance": db_user.balance,
                "level": db_user.level,
                "is_admin": db_user.is_admin,
                "is_verified": db_user.is_verifie