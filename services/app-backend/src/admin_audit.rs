use super::*;
use sqlx::{Postgres, Transaction};

#[derive(Deserialize)]
pub(super) struct AdminAuditQuery {
    pub(super) before_id: Option<i64>,
    pub(super) limit: Option<i64>,
}

#[derive(FromRow, Serialize)]
pub(super) struct AdminAuditEvent {
    id: i64,
    actor_admin_id: Option<i64>,
    actor_name: Option<String>,
    actor_email: Option<String>,
    action: String,
    entity_type: String,
    entity_id: String,
    details: SqlJson<serde_json::Value>,
    created_at: String,
}

#[derive(Serialize)]
pub(super) struct AdminAuditResponse {
    data: Vec<AdminAuditEvent>,
    next_before_id: Option<i64>,
}

pub(super) async fn admin_list_audit_events(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AdminAuditQuery>,
) -> Result<Json<AdminAuditResponse>, ApiError> {
    authorized_super_admin(&state.pool, &headers).await?;
    let limit = query.limit.unwrap_or(100).clamp(1, 200);
    let data = sqlx::query_as::<_, AdminAuditEvent>(
        "SELECT events.id, events.actor_admin_id, events.actor_name, events.actor_email, events.action, events.entity_type, events.entity_id, events.details, events.created_at::text AS created_at FROM admin_audit_events AS events WHERE ($1::BIGINT IS NULL OR events.id < $1) ORDER BY events.id DESC LIMIT $2",
    )
    .bind(query.before_id)
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    let next_before_id = if data.len() as i64 == limit {
        data.last().map(|event| event.id)
    } else {
        None
    };
    Ok(Json(AdminAuditResponse {
        data,
        next_before_id,
    }))
}

pub(super) async fn record_admin_audit(
    transaction: &mut Transaction<'_, Postgres>,
    actor_admin_id: i64,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    details: serde_json::Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO admin_audit_events (actor_admin_id, actor_name, actor_email, action, entity_type, entity_id, details) SELECT admins.id, admins.name, admins.email, $2, $3, $4, $5 FROM admins WHERE admins.id = $1",
    )
    .bind(actor_admin_id)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(SqlJson(details))
    .execute(&mut **transaction)
    .await?;
    Ok(())
}
