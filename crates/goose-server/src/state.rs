use axum::http::StatusCode;
use goose::execution::manager::AgentManager;
use goose::scheduler_trait::SchedulerTrait;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::AtomicUsize;
use std::sync::Arc;
use tokio::sync::{Mutex, oneshot};
use crate::routes::sampling::SamplingRequest;

#[derive(Clone)]
pub struct AppState {
    pub(crate) agent_manager: Arc<AgentManager>,
    pub recipe_file_hash_map: Arc<Mutex<HashMap<String, PathBuf>>>,
    pub session_counter: Arc<AtomicUsize>,
    /// Tracks sessions that have already emitted recipe telemetry to prevent double counting.
    recipe_session_tracker: Arc<Mutex<HashSet<String>>>,
    /// Pending sampling requests awaiting approval
    pending_sampling_requests: Arc<Mutex<HashMap<String, (SamplingRequest, oneshot::Sender<bool>)>>>,
}

impl AppState {
    pub async fn new() -> anyhow::Result<Arc<AppState>> {
        let agent_manager = AgentManager::instance().await?;
        Ok(Arc::new(Self {
            agent_manager,
            recipe_file_hash_map: Arc::new(Mutex::new(HashMap::new())),
            session_counter: Arc::new(AtomicUsize::new(0)),
            recipe_session_tracker: Arc::new(Mutex::new(HashSet::new())),
            pending_sampling_requests: Arc::new(Mutex::new(HashMap::new())),
        }))
    }

    pub async fn scheduler(&self) -> Result<Arc<dyn SchedulerTrait>, anyhow::Error> {
        self.agent_manager.scheduler().await
    }

    pub async fn set_recipe_file_hash_map(&self, hash_map: HashMap<String, PathBuf>) {
        let mut map = self.recipe_file_hash_map.lock().await;
        *map = hash_map;
    }

    pub async fn mark_recipe_run_if_absent(&self, session_id: &str) -> bool {
        let mut sessions = self.recipe_session_tracker.lock().await;
        if sessions.contains(session_id) {
            false
        } else {
            sessions.insert(session_id.to_string());
            true
        }
    }

    pub async fn get_agent(&self, session_id: String) -> anyhow::Result<Arc<goose::agents::Agent>> {
        let agent = self.agent_manager.get_or_create_agent(session_id).await?;
        
        // Set up the approval callback if not already set
        let state = Arc::new(self.clone());
        let callback: goose::agents::extension_manager::ApprovalCallback = Arc::new(move |params, extension_name| {
            let state = state.clone();
            Box::pin(async move {
                use uuid::Uuid;
                
                // Convert CreateMessageRequestParam to SamplingRequest
                let request_id = Uuid::new_v4().to_string();
                let messages: Vec<crate::routes::sampling::SamplingMessage> = params.messages.iter().map(|msg| {
                    let role = match msg.role {
                        rmcp::model::Role::User => "user".to_string(),
                        rmcp::model::Role::Assistant => "assistant".to_string(),
                    };
                    let content = if let Some(text) = msg.content.as_text() {
                        text.text.clone()
                    } else {
                        "".to_string()
                    };
                    crate::routes::sampling::SamplingMessage { role, content }
                }).collect();
                
                let model_preferences = params.model_preferences.as_ref().map(|prefs| {
                    crate::routes::sampling::ModelPreferences {
                        hints: prefs.hints.as_ref().map(|hints| {
                            hints.iter().map(|hint| {
                                crate::routes::sampling::ModelHint {
                                    name: hint.name.clone(),
                                }
                            }).collect()
                        }),
                        cost_priority: prefs.cost_priority.map(|v| v as f64),
                        speed_priority: prefs.speed_priority.map(|v| v as f64),
                        intelligence_priority: prefs.intelligence_priority.map(|v| v as f64),
                    }
                });
                
                let sampling_request = crate::routes::sampling::SamplingRequest {
                    id: request_id.clone(),
                    extension_name,
                    messages,
                    system_prompt: params.system_prompt.clone(),
                    max_tokens: params.max_tokens as i32,
                    model_preferences,
                };
                
                // Add to pending requests and wait for approval
                let approval_rx = state.add_pending_sampling_request(sampling_request).await;
                
                // Wait for approval with a timeout
                match tokio::time::timeout(std::time::Duration::from_secs(300), approval_rx).await {
                    Ok(Ok(approved)) => Ok(approved),
                    Ok(Err(_)) => Err(rmcp::ServiceError::UnexpectedResponse),
                    Err(_) => {
                        // Timeout - remove from pending and deny
                        let _ = state.respond_to_sampling_request(&request_id, false).await;
                        Ok(false)
                    }
                }
            })
        });
        
        agent.extension_manager.set_approval_callback(callback).await;
        
        Ok(agent)
    }

    /// Get agent for route handlers - always uses Interactive mode and converts any error to 500
    pub async fn get_agent_for_route(
        &self,
        session_id: String,
    ) -> Result<Arc<goose::agents::Agent>, StatusCode> {
        self.get_agent(session_id).await.map_err(|e| {
            tracing::error!("Failed to get agent: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })
    }

    /// Add a pending sampling request and return a receiver for the approval
    pub async fn add_pending_sampling_request(
        &self,
        request: SamplingRequest,
    ) -> oneshot::Receiver<bool> {
        let (tx, rx) = oneshot::channel();
        let mut pending = self.pending_sampling_requests.lock().await;
        pending.insert(request.id.clone(), (request, tx));
        rx
    }

    /// Get all pending sampling requests
    pub async fn get_pending_sampling_requests(&self) -> Vec<SamplingRequest> {
        let pending = self.pending_sampling_requests.lock().await;
        pending.values().map(|(req, _)| req.clone()).collect()
    }

    /// Respond to a sampling request with approval or denial
    pub async fn respond_to_sampling_request(
        &self,
        request_id: &str,
        approved: bool,
    ) -> anyhow::Result<()> {
        let mut pending = self.pending_sampling_requests.lock().await;
        if let Some((_, tx)) = pending.remove(request_id) {
            let _ = tx.send(approved);
            Ok(())
        } else {
            Err(anyhow::anyhow!("Request not found"))
        }
    }
}
