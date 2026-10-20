import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, EmptyState } from "@/components/ui";

export function NotFoundPage() {
  return (
    <div className="page py-14">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you are looking for does not exist or has moved. Check the address, or head back to the festival home."
        action={
          <Link to="/">
            <Button>Back to home</Button>
          </Link>
        }
      />
    </div>
  );
}
