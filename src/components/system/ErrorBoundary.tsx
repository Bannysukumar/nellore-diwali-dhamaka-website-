import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "@/components/ui";
import { isStaleBuildError, reloadForNewBuild } from "@/lib/staleBuild";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  error: Error | null;
}

/** Catches render failures so one broken module cannot blank the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isStaleBuildError(error) && reloadForNewBuild()) return;
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error && isStaleBuildError(error)) {
      return (
        <div className="page py-10">
          <ErrorState
            title="The site was just updated"
            description="Tap Try again to open the latest version."
            onRetry={() => window.location.reload()}
          />
        </div>
      );
    }
    if (error) {
      return (
        <div className="page py-10">
          <ErrorState
            title={this.props.fallbackTitle ?? "This section could not be displayed"}
            description={error.message}
            onRetry={() => this.setState({ error: null })}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
