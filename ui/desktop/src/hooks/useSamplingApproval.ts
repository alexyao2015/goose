import { useState, useEffect, useCallback } from 'react';
import { client } from '../api/client.gen';
import { SamplingRequest } from '../api/types.gen';

export const useSamplingApproval = (pollingInterval: number = 1500) => {
  const [pendingRequests, setPendingRequests] = useState<SamplingRequest[]>([]);
  const [currentRequest, setCurrentRequest] = useState<SamplingRequest | null>(null);
  const [isPolling, setIsPolling] = useState(true);

  // Poll for pending requests
  useEffect(() => {
    if (!isPolling) return;

    const pollPendingRequests = async () => {
      try {
        const response = await client.GET('/sampling/pending');
        if (response.data) {
          setPendingRequests(response.data);
          
          // If we don't have a current request and there are pending requests, show the first one
          if (!currentRequest && response.data.length > 0) {
            setCurrentRequest(response.data[0]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch pending sampling requests:', error);
      }
    };

    // Poll immediately
    pollPendingRequests();

    // Then poll at interval
    const intervalId = setInterval(pollPendingRequests, pollingInterval);

    return () => clearInterval(intervalId);
  }, [isPolling, pollingInterval, currentRequest]);

  const approveSamplingRequest = useCallback(async (requestId: string) => {
    try {
      await client.POST('/sampling/{request_id}/approve', {
        params: { path: { request_id: requestId } },
        body: { approved: true },
      });

      // Remove from pending and clear current if it matches
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
      if (currentRequest?.id === requestId) {
        setCurrentRequest(null);
      }
    } catch (error) {
      console.error('Failed to approve sampling request:', error);
      throw error;
    }
  }, [currentRequest]);

  const denySamplingRequest = useCallback(async (requestId: string) => {
    try {
      await client.POST('/sampling/{request_id}/approve', {
        params: { path: { request_id: requestId } },
        body: { approved: false },
      });

      // Remove from pending and clear current if it matches
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
      if (currentRequest?.id === requestId) {
        setCurrentRequest(null);
      }
    } catch (error) {
      console.error('Failed to deny sampling request:', error);
      throw error;
    }
  }, [currentRequest]);

  const dismissCurrentRequest = useCallback(() => {
    setCurrentRequest(null);
  }, []);

  return {
    pendingRequests,
    currentRequest,
    approveSamplingRequest,
    denySamplingRequest,
    dismissCurrentRequest,
    isPolling,
    setIsPolling,
  };
};
