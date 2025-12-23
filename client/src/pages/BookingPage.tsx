import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { theme } from '../theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface TimeSlot {
  start: string;
  end: string;
  duration: number;
}

const BookingPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [loading, setLoading] = useState(true);
  const [bookingStatus, setBookingStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSlots = async () => {
      try {
        const response = await axios.get(`${API_URL}/public/calendar/${userId}/slots`);
        setSlots(response.data);
      } catch (error) {
        console.error('Error fetching slots:', error);
        setError('Failed to load available times');
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchSlots();
    }
  }, [userId]);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !guestEmail || !userId) return;

    setBookingStatus('submitting');
    try {
      await axios.post(`${API_URL}/public/calendar/${userId}/book`, {
        startTime: selectedSlot.start,
        guestEmail,
        guestName,
        duration: selectedSlot.duration,
      });
      setBookingStatus('success');
    } catch (error) {
      console.error('Error booking slot:', error);
      setBookingStatus('error');
      setError('Failed to book the appointment. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: theme.colors.background.default,
        fontFamily: theme.typography.fontFamily,
      }}>
        Loading available times...
      </div>
    );
  }

  if (bookingStatus === 'success') {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: theme.colors.background.default,
        fontFamily: theme.typography.fontFamily,
      }}>
        <div style={{
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing['2xl'],
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.md,
          textAlign: 'center',
          maxWidth: '500px',
        }}>
          <div style={{ 
            color: theme.colors.accent.success, 
            fontSize: theme.typography.fontSize['3xl'],
            marginBottom: theme.spacing.lg 
          }}>✓</div>
          <h1 style={{ 
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.md 
          }}>Booking Confirmed!</h1>
          <p style={{ color: theme.colors.text.secondary }}>
            A calendar invitation has been sent to {guestEmail}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.colors.background.default,
      fontFamily: theme.typography.fontFamily,
      padding: theme.spacing.xl,
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.lg,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: theme.spacing.xl,
          backgroundColor: theme.colors.primary.main,
          color: 'white',
        }}>
          <h1 style={{ margin: 0, fontSize: theme.typography.fontSize['2xl'] }}>Book a Meeting</h1>
          <p style={{ marginTop: theme.spacing.sm, opacity: 0.9 }}>Select a time slot below</p>
        </div>

        <div style={{ padding: theme.spacing.xl }}>
          {error && (
            <div style={{
              backgroundColor: `${theme.colors.accent.error}20`,
              color: theme.colors.accent.error,
              padding: theme.spacing.md,
              borderRadius: theme.borderRadius.md,
              marginBottom: theme.spacing.lg,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: theme.spacing.xl, flexWrap: 'wrap' }}>
            {/* Slot Selection */}
            <div style={{ flex: 1, minWidth: '300px' }}>
              <h2 style={{ 
                fontSize: theme.typography.fontSize.lg, 
                color: theme.colors.text.primary,
                marginBottom: theme.spacing.md 
              }}>Available Times</h2>
              
              {slots.length === 0 ? (
                <p style={{ color: theme.colors.text.secondary }}>No slots available for the next 7 days.</p>
              ) : (
                <div style={{ display: 'grid', gap: theme.spacing.sm }}>
                  {slots.map((slot, index) => {
                    const start = new Date(slot.start);
                    const isSelected = selectedSlot === slot;
                    
                    return (
                      <button
                        key={index}
                        onClick={() => setSelectedSlot(slot)}
                        style={{
                          padding: theme.spacing.md,
                          border: `1px solid ${isSelected ? theme.colors.primary.main : theme.colors.border.medium}`,
                          backgroundColor: isSelected ? `${theme.colors.primary.main}10` : 'white',
                          borderRadius: theme.borderRadius.md,
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: theme.typography.fontWeight.medium, color: theme.colors.text.primary }}>
                            {start.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                          </div>
                          <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
                            {start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} ({slot.duration} min)
                          </div>
                        </div>
                        {isSelected && (
                          <span style={{ color: theme.colors.primary.main }}>●</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Booking Form */}
            <div style={{ flex: 1, minWidth: '300px' }}>
              <h2 style={{ 
                fontSize: theme.typography.fontSize.lg, 
                color: theme.colors.text.primary,
                marginBottom: theme.spacing.md 
              }}>Your Details</h2>
              
              <form onSubmit={handleBook}>
                <div style={{ marginBottom: theme.spacing.md }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: theme.spacing.xs,
                    color: theme.colors.text.primary,
                    fontSize: theme.typography.fontSize.sm
                  }}>Name</label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: theme.spacing.md,
                      border: `1px solid ${theme.colors.border.medium}`,
                      borderRadius: theme.borderRadius.md,
                      fontSize: theme.typography.fontSize.base,
                    }}
                  />
                </div>

                <div style={{ marginBottom: theme.spacing.lg }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: theme.spacing.xs,
                    color: theme.colors.text.primary,
                    fontSize: theme.typography.fontSize.sm
                  }}>Email</label>
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: theme.spacing.md,
                      border: `1px solid ${theme.colors.border.medium}`,
                      borderRadius: theme.borderRadius.md,
                      fontSize: theme.typography.fontSize.base,
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!selectedSlot || bookingStatus === 'submitting'}
                  style={{
                    width: '100%',
                    padding: theme.spacing.lg,
                    backgroundColor: selectedSlot ? theme.colors.primary.main : theme.colors.border.dark,
                    color: 'white',
                    border: 'none',
                    borderRadius: theme.borderRadius.md,
                    cursor: selectedSlot ? 'pointer' : 'not-allowed',
                    fontSize: theme.typography.fontSize.base,
                    fontWeight: theme.typography.fontWeight.semibold,
                  }}
                >
                  {bookingStatus === 'submitting' ? 'Booking...' : 'Confirm Booking'}
                </button>
                
                {!selectedSlot && (
                  <p style={{ 
                    marginTop: theme.spacing.sm, 
                    color: theme.colors.text.secondary, 
                    fontSize: theme.typography.fontSize.sm,
                    textAlign: 'center'
                  }}>
                    Please select a time slot first
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingPage;

