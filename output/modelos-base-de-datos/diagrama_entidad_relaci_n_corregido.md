erDiagram

    %% ----------------------------------------------------
    %% USERS & DENTISTS (Relación 1:1 / Herencia)
    %% ----------------------------------------------------
    users {
        uuid id PK
        string email UK
        string password_hash
        string role
        timestamp created_at
    }

    dentists {
        uuid id PK,FK "Ref: users.id"
        string license_number UK
        string specialty
    }

    %% ----------------------------------------------------
    %% ENTIDADES CORE
    %% ----------------------------------------------------
    patients {
        uuid id PK
        string first_name
        string last_name
        string phone
        string reference UK
    }

    services {
        uuid id PK
        string name UK
        decimal price
        int duration_minutes
    }

    stations {
        uuid id PK
        string name UK
    }

    shifts {
        uuid id PK
        string name
        time start_time
        time end_time
    }

    calendar_days {
        uuid id PK
        uuid shift_id FK
        date date
    }

    cards {
        uuid id PK
        string uid UK
        uuid user_id FK "Nullable"
    }

    %% ----------------------------------------------------
    %% PROCESOS PRINCIPALES: CITAS Y ATENCIONES
    %% ----------------------------------------------------
    appointments {
        uuid id PK
        uuid patient_id FK
        uuid dentist_id FK
        uuid service_id FK
        timestamp scheduled_at
        string status
    }

    attentions {
        uuid id PK
        uuid appointment_id FK "Nullable (en caso de emergencia)"
        uuid patient_id FK
        uuid dentist_id FK
        uuid service_id FK
        uuid station_id FK
        uuid shift_id FK
        uuid card_id FK "Nullable"
        timestamp created_at
    }

    %% ----------------------------------------------------
    %% ASIGNACIONES, INCIDENCIAS Y EVENTOS DE HARDWARE
    %% ----------------------------------------------------
    rfid_events {
        uuid id PK
        uuid station_id FK
        uuid card_id FK
        timestamp scanned_at
    }

    assignments {
        uuid id PK
        uuid attention_id FK
        uuid card_id FK
    }

    incidents {
        uuid id PK
        uuid attention_id FK "Nullable"
        uuid actor_id FK "Ref: users.id"
        string description
        timestamp reported_at
    }

    %% ----------------------------------------------------
    %% AUDITORÍA Y SESIONES
    %% ----------------------------------------------------
    audit {
        uuid id PK
        uuid actor_id FK "Nullable"
        string action
        string table_name
        timestamp performed_at
    }

    sessions {
        string token_hash PK
        uuid user_id FK
        timestamp expires_at
    }

    operation_mutex {
        int id PK
        string lock_key UK
        timestamp acquired_at
    }

    %% ----------------------------------------------------
    %% RELACIONES
    %% ----------------------------------------------------
    users ||--o| dentists : "es un"
    users ||--o{ cards : "posee"
    users ||--o{ audit : "ejecuta"
    users ||--o{ sessions : "mantiene"
    users ||--o{ incidents : "reporta"

    shifts ||--o{ calendar_days : "aplica_en"
    shifts ||--o{ attentions : "ocurre_en"

    patients ||--o{ appointments : "solicita"
    patients ||--o{ attentions : "recibe"

    dentists ||--o{ appointments : "atiende"
    dentists ||--o{ attentions : "brinda"

    services ||--o{ appointments : "requiere"
    services ||--o{ attentions : "ejecuta"

    stations ||--o{ rfid_events : "registra"
    stations ||--o{ attentions : "alberga"

    cards ||--o{ rfid_events : "es_escaneada"
    cards ||--o{ attentions : "asociada"
    cards ||--o{ assignments : "asignada"

    appointments ||--o| attentions : "se_convierte_en"

    attentions ||--o{ assignments : "contiene"
    attentions ||--o{ incidents : "genera"