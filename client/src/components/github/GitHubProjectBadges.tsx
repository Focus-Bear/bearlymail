import React, { useEffect, useState } from 'react';
import { theme } from 'theme/theme';
import { GitHubLink } from 'types/email';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface GitHubProjectBadgesProps {
  emailId: string;
  initialLinks?: GitHubLink[];
}

export const GitHubProjectBadges: React.FC<GitHubProjectBadgesProps> = ({
  emailId,
  initialLinks = [],
}) => {
  const [projects, setProjects] = useState<Array<{ name: string; status?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch if we have an email ID
    if (!emailId) return;

    // Extract projects from initial links if available
    const projectsFromLinks: Array<{ name: string; status?: string }> = [];
    for (const link of initialLinks) {
      if (link.status?.projects && Array.isArray(link.status.projects)) {
        for (const project of link.status.projects) {
          projectsFromLinks.push({
            name: project.name,
            status: project.status,
          });
        }
      }
    }

    if (projectsFromLinks.length > 0) {
      // Use cached data from initial links
      setProjects(projectsFromLinks);
      return;
    }

    // Only fetch if we have initial links (meaning this is a GitHub email)
    // but projects haven't been loaded yet
    if (initialLinks.length === 0) {
      // No GitHub links, nothing to fetch
      return;
    }

    // If we have GitHub links but no projects yet, fetch asynchronously
    const fetchProjects = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(`${API_URL}/github/emails/${emailId}`);
        const links = response.data.links || [];
        
        const fetchedProjects: Array<{ name: string; status?: string }> = [];
        for (const link of links) {
          if (link.status?.projects && Array.isArray(link.status.projects)) {
            for (const project of link.status.projects) {
              fetchedProjects.push({
                name: project.name,
                status: project.status,
              });
            }
          }
        }
        setProjects(fetchedProjects);
      } catch (err: any) {
        // Silently fail - don't show error for missing GitHub data
        setError(err?.message || 'Failed to fetch projects');
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [emailId, initialLinks]);

  // Don't render anything if no projects
  if (projects.length === 0 && !loading) {
    return null;
  }

  // Show a subtle loading indicator or nothing while loading
  if (loading && projects.length === 0) {
    return null; // Don't show loading spinner in inbox card
  }

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xs,
    }}>
      {projects.slice(0, 3).map((project, index) => (
        <div
          key={`${project.name}-${index}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: theme.colors.background.default,
            borderRadius: theme.borderRadius.sm,
            border: `1px solid ${theme.colors.border.light}`,
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.secondary,
          }}
        >
          <span style={{ fontWeight: theme.typography.fontWeight.medium }}>
            {project.name}
          </span>
          {project.status && (
            <span style={{
              padding: `2px ${theme.spacing.xs}`,
              backgroundColor: theme.colors.primary.subtle,
              borderRadius: theme.borderRadius.xs,
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.primary.main,
            }}>
              {project.status}
            </span>
          )}
        </div>
      ))}
      {projects.length > 3 && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.xs,
        }}>
          +{projects.length - 3}
        </div>
      )}
    </div>
  );
};

