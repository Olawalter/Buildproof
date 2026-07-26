"use client";
import Link from "next/link";
import { Building2, MapPin, DollarSign, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/StatusChip";
import { shortAddress, formatWei } from "@/lib/utils";
import type { ProjectSummary } from "@/types";

interface ProjectCardProps {
  project: ProjectSummary;
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link href={`/project/${project.id}`}>
      <Card className="group cursor-pointer transition-all duration-300 hover:border-bp-orange/30 hover:shadow-bp-orange/10 hover:shadow-2xl hover:-translate-y-0.5">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bp-orange/10 border border-bp-orange/20">
                <Building2 className="h-5 w-5 text-bp-orange" />
              </div>
              <div>
                <h3 className="font-semibold text-white line-clamp-1 group-hover:text-bp-orange transition-colors">
                  {project.title}
                </h3>
                <p className="text-xs text-white/40 mt-0.5">ID #{project.id}</p>
              </div>
            </div>
            <StatusChip status={project.status} />
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-white/50">
              <DollarSign className="h-3.5 w-3.5 shrink-0" />
              <span className="text-white/70">Contract Value:</span>
              <span className="text-white font-medium">
                {formatWei(project.contract_value)}
              </span>
            </div>
            {project.escrow_deposited !== "0" && (
              <div className="flex items-center gap-2 text-white/50">
                <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-bp-gold/50 bg-bp-gold/10" />
                <span className="text-white/70">Escrowed:</span>
                <span className="text-bp-gold font-medium">
                  {formatWei(project.escrow_deposited)}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-white/50 text-xs mt-3 pt-3 border-t border-white/5">
              <span>Owner: {shortAddress(project.owner)}</span>
              {project.contractor && (
                <>
                  <span className="text-white/20">•</span>
                  <span>Contractor: {shortAddress(project.contractor)}</span>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-1 text-xs text-bp-orange/60 group-hover:text-bp-orange transition-colors">
            <span>View details</span>
            <ArrowRight className="h-3 w-3" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
