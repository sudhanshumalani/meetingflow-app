// Meeting templates based on stakeholder categories

export const MEETING_TEMPLATES = {
  leadership: {
    name: "Leadership Review",
    description: "Strategic alignment and executive decision making",
    quadrants: {
      topLeft: { title: "Strategic Goals", placeholder: "Key strategic objectives and priorities..." },
      topRight: { title: "Decisions Made", placeholder: "Executive decisions and approvals..." },
      bottomLeft: { title: "Resource Allocation", placeholder: "Budget, people, and resource decisions..." },
      bottomRight: { title: "Action Items", placeholder: "Follow-up tasks and ownership..." }
    },
    color: "purple"
  },
  
  engineering: {
    name: "Technical Review",
    description: "Engineering progress and technical decisions",
    quadrants: {
      topLeft: { title: "Technical Progress", placeholder: "Development updates and completions..." },
      topRight: { title: "Blockers & Issues", placeholder: "Technical challenges and impediments..." },
      bottomLeft: { title: "Architecture Decisions", placeholder: "Technical design and architecture..." },
      bottomRight: { title: "Sprint Planning", placeholder: "Upcoming tasks and estimates..." }
    },
    color: "blue"
  },
  
  product: {
    name: "Product Planning",
    description: "Product strategy and feature planning",
    quadrants: {
      topLeft: { title: "User Feedback", placeholder: "Customer insights and user research..." },
      topRight: { title: "Feature Priorities", placeholder: "Roadmap items and priorities..." },
      bottomLeft: { title: "Market Analysis", placeholder: "Competitive insights and opportunities..." },
      bottomRight: { title: "Success Metrics", placeholder: "KPIs and measurement criteria..." }
    },
    color: "green"
  },
  
  design: {
    name: "Design Review",
    description: "User experience and design decisions",
    quadrants: {
      topLeft: { title: "User Experience", placeholder: "UX insights and usability findings..." },
      topRight: { title: "Design Decisions", placeholder: "Visual and interaction design choices..." },
      bottomLeft: { title: "Prototype Feedback", placeholder: "Testing results and iterations..." },
      bottomRight: { title: "Design System", placeholder: "Component and pattern updates..." }
    },
    color: "pink"
  },
  
  marketing: {
    name: "Marketing Sync",
    description: "Campaign planning and market insights",
    quadrants: {
      topLeft: { title: "Campaign Performance", placeholder: "Metrics and campaign results..." },
      topRight: { title: "Market Insights", placeholder: "Customer behavior and trends..." },
      bottomLeft: { title: "Content Strategy", placeholder: "Messaging and content planning..." },
      bottomRight: { title: "Growth Initiatives", placeholder: "New opportunities and experiments..." }
    },
    color: "orange"
  },
  
  sales: {
    name: "Sales Review",
    description: "Pipeline and customer relationship management",
    quadrants: {
      topLeft: { title: "Pipeline Status", placeholder: "Deal progress and forecasts..." },
      topRight: { title: "Customer Feedback", placeholder: "Client insights and requests..." },
      bottomLeft: { title: "Sales Challenges", placeholder: "Obstacles and competitive issues..." },
      bottomRight: { title: "Account Strategy", placeholder: "Growth and retention plans..." }
    },
    color: "indigo"
  },
  
  operations: {
    name: "Operations Review",
    description: "Process optimization and operational efficiency",
    quadrants: {
      topLeft: { title: "Process Updates", placeholder: "Workflow improvements and changes..." },
      topRight: { title: "Performance Metrics", placeholder: "KPIs and operational measurements..." },
      bottomLeft: { title: "Resource Planning", placeholder: "Capacity and resource allocation..." },
      bottomRight: { title: "Risk Management", placeholder: "Risks and mitigation strategies..." }
    },
    color: "gray"
  },
  
  external: {
    name: "Client Meeting",
    description: "External stakeholder engagement",
    quadrants: {
      topLeft: { title: "Client Objectives", placeholder: "Client goals and requirements..." },
      topRight: { title: "Project Status", placeholder: "Deliverables and timeline updates..." },
      bottomLeft: { title: "Challenges & Risks", placeholder: "Issues and mitigation plans..." },
      bottomRight: { title: "Next Steps", placeholder: "Action items and follow-up..." }
    },
    color: "teal"
  }
}

export const PRIORITY_LEVELS = {
  high: { label: "High Priority", color: "red", icon: "🔴" },
  medium: { label: "Medium Priority", color: "yellow", icon: "🟡" },
  low: { label: "Low Priority", color: "green", icon: "🟢" }
}

export const getTemplateForCategory = (category) => {
  return MEETING_TEMPLATES[category] || MEETING_TEMPLATES.external
}

export const getColorClasses = (color) => {
  const colorMap = {
    purple: "border-purple-200 bg-purple-50 text-purple-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    green: "border-green-200 bg-green-50 text-green-800",
    pink: "border-pink-200 bg-pink-50 text-pink-800",
    orange: "border-orange-200 bg-orange-50 text-orange-800",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
    gray: "border-gray-200 bg-gray-50 text-gray-800",
    teal: "border-teal-200 bg-teal-50 text-teal-800"
  }
  return colorMap[color] || colorMap.gray
}