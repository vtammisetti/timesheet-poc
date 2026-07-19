using TimesheetService as service from '../../srv/timesheet-service';
annotate service.TimeEntries with @(
    UI.FieldGroup #GeneratedGroup : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Label : 'employee_ID',
                Value : employee_ID,
            },
            {
                $Type : 'UI.DataField',
                Label : 'entryDate',
                Value : entryDate,
            },
            {
                $Type : 'UI.DataField',
                Label : 'workCenter',
                Value : workCenter,
            },
            {
                $Type : 'UI.DataField',
                Label : 'category',
                Value : category,
            },
            {
                $Type : 'UI.DataField',
                Label : 'hours',
                Value : hours,
            },
            {
                $Type : 'UI.DataField',
                Label : 'status',
                Value : status,
            },
        ],
    },
    UI.Facets : [
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'GeneratedFacet1',
            Label : 'General Information',
            Target : '@UI.FieldGroup#GeneratedGroup',
        },
    ],
    UI.LineItem : [
        {
            $Type : 'UI.DataField',
            Label : 'employee_ID',
            Value : employee_ID,
        },
        {
            $Type : 'UI.DataField',
            Label : 'entryDate',
            Value : entryDate,
        },
        {
            $Type : 'UI.DataField',
            Label : 'workCenter',
            Value : workCenter,
        },
        {
            $Type : 'UI.DataField',
            Label : 'category',
            Value : category,
        },
        {
            $Type : 'UI.DataField',
            Label : 'hours',
            Value : hours,
        },
    ],
);

annotate service.TimeEntries with {
    employee @Common.ValueList : {
        $Type : 'Common.ValueListType',
        CollectionPath : 'Employees',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : employee_ID,
                ValueListProperty : 'ID',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'name',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'role',
            },
        ],
    }
};

